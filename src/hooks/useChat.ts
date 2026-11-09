import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invokeChatAi } from '@/services/chat';
import { captureError } from '@/lib/sentry';
import {
  countTodayUserMessages,
  listChatMessages,
  MAX_MESSAGE_CHARS,
  type StoredChatMessage,
} from '@/services/chatMessages';
import { queryKeys, todayKey } from '@/lib/queryKeys';
import { handleNeedsUpgrade } from '@/lib/paywall';
import { useAuth } from './useAuth';
import { useAiQuotaState } from './useAiUsage';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  error?: boolean;
  pending?: boolean;
};

export { MAX_MESSAGE_CHARS };

function toUiMessage(m: StoredChatMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role,
    text: m.content,
    createdAt: new Date(m.created_at).getTime(),
  };
}

export function useChatMessages() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: userId
      ? queryKeys.chatMessages(userId)
      : ['chat-messages', 'none'],
    queryFn: () => listChatMessages(userId!),
    enabled: !!userId,
    staleTime: 5_000,
  });
}

export function useDailyMessageCount() {
  const { user } = useAuth();
  const userId = user?.id;
  const day = todayKey();
  return useQuery({
    queryKey: userId
      ? queryKeys.chatDailyCount(userId, day)
      : ['chat-daily-count', 'none'],
    queryFn: () => countTodayUserMessages(userId!),
    enabled: !!userId,
    staleTime: 5_000,
  });
}

/**
 * Mensagem em curso: aguardando resposta da edge function. UI mostra
 * "Pensando..." até a chamada terminar.
 */
type PendingState = {
  userText: string;
  startedAt: number;
  abortController: AbortController;
} | null;

/**
 * Animação visual da resposta (typewriter effect). A msg JÁ está no banco
 * — a animação é só visual. `matchedId` é o id da msg do stored, usado pra
 * esconder a versão completa enquanto a versão animada incrementa.
 */
type AnimatingState = {
  matchedId: string;
  fullText: string;
  displayedLength: number;
  startedAt: number;
} | null;

/**
 * Erro da última tentativa, mantido até o user tentar de novo / enviar nova msg.
 * `retryable=false` em casos como cota esgotada (não adianta retry).
 */
type LastError = {
  message: string;
  retryable: boolean;
  userText: string;
  startedAt: number;
} | null;

/** ~60fps. */
const ANIMATION_TICK_MS = 16;
/** ~250 chars/seg — natural mas não lento (resposta de 500 chars em ~2s). */
const ANIMATION_CHARS_PER_TICK = 4;

export function useChat() {
  const messagesQ = useChatMessages();
  const countQ = useDailyMessageCount();
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  const day = todayKey();

  const [pending, setPending] = useState<PendingState>(null);
  const [animating, setAnimating] = useState<AnimatingState>(null);
  const [lastError, setLastError] = useState<LastError>(null);

  const abortRef = useRef<AbortController | null>(null);

  const dailyCount = countQ.data ?? 0;
  const {
    limit: dailyLimit,
    remaining,
    limitReached,
  } = useAiQuotaState('chat', dailyCount);
  const isSending = pending !== null;

  // Typewriter: incrementa displayedLength via setTimeout encadeado.
  useEffect(() => {
    if (!animating) return;
    if (animating.displayedLength >= animating.fullText.length) {
      // Animação terminou — pequeno delay pra suavizar transição.
      const t = setTimeout(() => setAnimating(null), 200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setAnimating((prev) =>
        prev
          ? {
              ...prev,
              displayedLength: Math.min(
                prev.displayedLength + ANIMATION_CHARS_PER_TICK,
                prev.fullText.length,
              ),
            }
          : prev,
      );
    }, ANIMATION_TICK_MS);
    return () => clearTimeout(t);
  }, [animating]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (limitReached || isSending) return;

      if (trimmed.length > MAX_MESSAGE_CHARS) {
        setLastError({
          message: `Limite de ${MAX_MESSAGE_CHARS} caracteres por mensagem.`,
          retryable: false,
          userText: trimmed,
          startedAt: Date.now(),
        });
        return;
      }

      // Cancela animação anterior (se rolando) — usuário começou nova msg.
      setAnimating(null);
      setLastError(null);

      const abortController = new AbortController();
      abortRef.current = abortController;
      const startedAt = Date.now();
      setPending({ userText: trimmed, startedAt, abortController });

      try {
        await invokeChatAi(
          { message: trimmed, mode: 'chat' },
          { signal: abortController.signal },
        );

        // Edge function persistiu user + assistant antes de retornar.
        if (userId) {
          const fresh = await listChatMessages(userId);
          qc.setQueryData(queryKeys.chatMessages(userId), fresh);
          void qc.invalidateQueries({
            queryKey: queryKeys.chatDailyCount(userId, day),
          });

          // A msg mais recente (fresh é desc) deve ser a assistant nova —
          // dispara animação typewriter pra entrega visual progressiva.
          const newest = fresh[0];
          if (newest?.role === 'assistant') {
            const createdAt = new Date(newest.created_at).getTime();
            if (createdAt >= startedAt) {
              setAnimating({
                matchedId: newest.id,
                fullText: newest.content,
                displayedLength: Math.min(
                  ANIMATION_CHARS_PER_TICK,
                  newest.content.length,
                ),
                startedAt: Date.now(),
              });
            }
          }
        }
      } catch (err) {
        // Gating do billing-core: 402 needs_upgrade → paywall, sem erro inline.
        // O check é antes de gastar/persistir no servidor, então nada foi consumido.
        if (handleNeedsUpgrade(err)) return;

        const wasAborted = abortController.signal.aborted;

        if (!wasAborted) {
          captureError(
            err instanceof Error ? err : new Error(String(err)),
            { feature: 'chat' },
          );
          const message =
            err instanceof Error
              ? err.message
              : 'Falha ao interagir com a IA. Tenta de novo mais tarde.';
          setLastError({
            message,
            retryable: !/limite/i.test(message),
            userText: trimmed,
            startedAt,
          });
        }

        // Refetch mesmo em erro/cancel: edge function persiste a user msg
        // ANTES de chamar Groq, então a cota foi consumida.
        if (userId) {
          void qc.invalidateQueries({
            queryKey: queryKeys.chatMessages(userId),
          });
          void qc.invalidateQueries({
            queryKey: queryKeys.chatDailyCount(userId, day),
          });
        }
      } finally {
        abortRef.current = null;
        setPending(null);
      }
    },
    [limitReached, isSending, userId, qc, day],
  );

  const cancelMessage = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retryLastMessage = useCallback(() => {
    if (!lastError?.retryable) return;
    const text = lastError.userText;
    setLastError(null);
    void sendMessage(text);
  }, [lastError, sendMessage]);

  const messages = useMemo<ChatMessage[]>(() => {
    const stored = (messagesQ.data ?? []).map(toUiMessage);

    if (pending) {
      const userInDb = stored.some(
        (m) => m.role === 'user' && m.text === pending.userText,
      );
      if (userInDb) return stored;
      return [
        {
          id: `pending-user-${pending.startedAt}`,
          role: 'user',
          text: pending.userText,
          createdAt: pending.startedAt,
          pending: true,
        },
        ...stored,
      ];
    }

    if (animating) {
      // Esconde a versão completa do stored (matchedId) e mostra a animada.
      const filteredStored = stored.filter(
        (m) => m.id !== animating.matchedId,
      );
      return [
        {
          id: `animating-${animating.matchedId}`,
          role: 'assistant',
          text: animating.fullText.slice(0, animating.displayedLength),
          createdAt: animating.startedAt,
        },
        ...filteredStored,
      ];
    }

    if (lastError) {
      const local: ChatMessage[] = [
        {
          id: `error-${lastError.startedAt}`,
          role: 'assistant',
          text: lastError.message,
          createdAt: lastError.startedAt + 1,
          error: true,
        },
      ];
      const userInDb = stored.some(
        (m) => m.role === 'user' && m.text === lastError.userText,
      );
      if (!userInDb) {
        local.push({
          id: `error-user-${lastError.startedAt}`,
          role: 'user',
          text: lastError.userText,
          createdAt: lastError.startedAt,
          pending: true,
        });
      }
      return [...local, ...stored];
    }

    return stored;
  }, [messagesQ.data, pending, animating, lastError]);

  return {
    messages,
    isSending,
    /** True só durante pending — typing indicator aparece antes da animação. */
    isAwaitingFirstToken: isSending,
    isLoading: messagesQ.isLoading,
    sendMessage,
    cancelMessage,
    retryLastMessage,
    canRetry: !!lastError?.retryable,
    dailyCount,
    dailyLimit,
    remaining,
    limitReached,
    maxChars: MAX_MESSAGE_CHARS,
  };
}
