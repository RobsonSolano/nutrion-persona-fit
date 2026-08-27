import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react-native';
import ConfirmModal from './ui/ConfirmModal';
import { colors } from '@/lib/theme';

export type AlertType = 'error' | 'success' | 'warning' | 'info';

type AlertOptions = {
  title: string;
  message?: string;
  type?: AlertType;
  confirmLabel?: string;
  onConfirm?: () => void;
};

type AlertContext = {
  /** Alerta genérico — qualquer combinação de title/message/type. */
  showAlert: (opts: AlertOptions) => void;
  /**
   * Conveniência pra erros: traduz mensagens técnicas (códigos HTTP,
   * stacktraces, "Network request failed") em texto amigável e
   * delega pra showAlert. Captura no Sentry deve continuar sendo
   * feita pelo caller via captureError — esse hook é só pra UI.
   */
  showError: (err: unknown) => void;
};

const Ctx = createContext<AlertContext | null>(null);

export function useAlert(): AlertContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useAlert deve ser chamado dentro de GlobalAlertProvider');
  }
  return ctx;
}

/**
 * Traduz mensagem técnica de erro em algo amigável pra mostrar pro user.
 * Erros 4xx/5xx genéricos viram "Tivemos uma instabilidade...". Erros
 * conhecidos (email duplicado, senha fraca, rate limit, etc) ganham
 * mensagem específica.
 */
function parseError(err: unknown): { title: string; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // Casos conhecidos com mensagem própria.
  if (
    lower.includes('email_already_registered') ||
    lower.includes('already registered') ||
    lower.includes('user already')
  ) {
    return {
      title: 'E-mail já cadastrado',
      message:
        'Esse e-mail já tem uma conta no Persona Fit. Confira se digitou certo (um caractere sobrando no fim é comum), use outro e-mail ou faça login com a conta existente.',
    };
  }
  if (lower.includes('invalid_email')) {
    return {
      title: 'E-mail inválido',
      message:
        'Confira o endereço de e-mail (ex: nome@dominio.com) e tente de novo.',
    };
  }
  if (lower.includes('invalid_birth_year')) {
    return {
      title: 'Ano de nascimento inválido',
      message: 'Informe um ano entre 1900 e o ano atual (ex: 1999).',
    };
  }
  if (lower.includes('weak_password')) {
    return {
      title: 'Senha fraca',
      message: 'A senha precisa ter pelo menos 8 caracteres.',
    };
  }
  if (lower.includes('invalid_body')) {
    return {
      title: 'Campos obrigatórios',
      message: 'Preencha e-mail, senha e nome do aluno antes de cadastrar.',
    };
  }
  if (lower.includes('create_user_failed')) {
    return {
      title: 'Não consegui criar o acesso do aluno',
      message:
        'Verifique se o e-mail é válido (ex: nome@dominio.com) e se a senha tem pelo menos 8 caracteres, e tente de novo.',
    };
  }
  if (lower.includes('student_limit_reached')) {
    return {
      title: 'Limite atingido',
      message:
        'Você atingiu o limite de alunos cadastrados. Pra aumentar, entre em contato com o suporte.',
    };
  }
  if (lower.includes('cref_required')) {
    return {
      title: 'Credencial obrigatória',
      message: 'Informe seu CREF (Educação Física) ou CRN (Nutrição).',
    };
  }
  if (lower.includes('rate_limit') || lower.match(/^429\b/)) {
    // Extrai segundos do detail (ex: "Aguarda ~45s e tenta de novo")
    const secondsMatch = raw.match(/~?(\d+)\s*s\b/);
    const seconds = secondsMatch ? Number(secondsMatch[1]) : null;
    return {
      title: 'Muitas requisições',
      message: seconds
        ? `Aguarde ~${seconds}s e tenta de novo. Se continuar, tente mais tarde.`
        : 'Aguarde alguns segundos e tenta de novo. Se continuar, tente mais tarde.',
    };
  }
  if (lower.includes('daily_limit') || lower.includes('limit reached')) {
    // Mensagens de cota: tenta extrair o detalhe do server.
    const cleaned = raw
      .replace(/^4\d{2}\s*·\s*/, '')
      .replace(/^daily_limit:?\s*/i, '')
      .replace(/^\{.*\}$/, '');
    return {
      title: 'Limite diário',
      message: cleaned || 'Você atingiu o limite diário desse recurso.',
    };
  }
  if (
    lower.includes('sessão expirada') ||
    lower.includes('session expired') ||
    lower.includes('jwt expired')
  ) {
    return {
      title: 'Sessão expirada',
      message: 'Sua sessão expirou. Faça login novamente pra continuar.',
    };
  }
  if (lower.includes('permission denied')) {
    return {
      title: 'Permissão negada',
      message: 'Verifique as permissões do app nas configurações do celular.',
    };
  }
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_credentials') ||
    lower.includes('invalid email or password')
  ) {
    return {
      title: 'Login inválido',
      message: 'Usuário e/ou senha incorreto.',
    };
  }
  if (
    lower.includes('network request failed') ||
    lower.includes('fetch failed') ||
    lower.includes('failed to fetch')
  ) {
    return {
      title: 'Sem conexão',
      message:
        'Verifique sua internet e tente novamente. Se o problema persistir, tente mais tarde.',
    };
  }

  // Erros HTTP genéricos: "500 · ..." ou "404 · ..."
  const httpMatch = raw.match(/^(\d{3})\s*·/);
  if (httpMatch) {
    const code = httpMatch[1];
    if (code.startsWith('5')) {
      return {
        title: 'Instabilidade',
        message:
          'Tivemos uma instabilidade neste recurso. Por favor, tente novamente mais tarde.',
      };
    }
    if (code === '404') {
      return {
        title: 'Não encontrado',
        message: 'O que você procura não foi encontrado.',
      };
    }
    if (code === '403' || code === '401') {
      return {
        title: 'Acesso negado',
        message:
          'Você não tem permissão pra essa ação ou sua sessão expirou.',
      };
    }
    if (code.startsWith('4')) {
      return {
        title: 'Não conseguimos processar',
        message:
          'A requisição não pôde ser processada. Confira os dados e tente de novo.',
      };
    }
  }

  // Erros JS comuns (TypeError, SyntaxError, etc) — totalmente técnicos.
  if (/^[A-Z][a-zA-Z]+Error\b/.test(raw) || raw.length > 200) {
    return {
      title: 'Algo deu errado',
      message:
        'Tivemos uma instabilidade neste recurso. Por favor, tente novamente mais tarde.',
    };
  }

  // Default: mostra a mensagem original (provavelmente já é amigável).
  return { title: 'Algo deu errado', message: raw };
}

function iconFor(type: AlertType) {
  switch (type) {
    case 'success':
      return <CheckCircle2 size={26} color={colors.accent} />;
    case 'warning':
      return <AlertTriangle size={26} color={colors.warn} />;
    case 'info':
      return <Info size={26} color={colors.violetSoft} />;
    case 'error':
    default:
      return <AlertTriangle size={26} color={colors.danger} />;
  }
}

export function GlobalAlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AlertOptions | null>(null);

  const showAlert = useCallback((opts: AlertOptions) => {
    setAlert(opts);
  }, []);

  const showError = useCallback((err: unknown) => {
    const parsed = parseError(err);
    setAlert({
      title: parsed.title,
      message: parsed.message,
      type: 'error',
    });
  }, []);

  function close() {
    const onConfirm = alert?.onConfirm;
    setAlert(null);
    if (onConfirm) onConfirm();
  }

  return (
    <Ctx.Provider value={{ showAlert, showError }}>
      {children}
      <ConfirmModal
        visible={!!alert}
        onClose={() => setAlert(null)}
        title={alert?.title ?? ''}
        message={alert?.message}
        icon={alert ? iconFor(alert.type ?? 'error') : null}
        actions={[
          {
            label: alert?.confirmLabel ?? 'OK',
            variant: 'primary',
            onPress: close,
          },
        ]}
      />
    </Ctx.Provider>
  );
}
