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
import { parseError } from '@/lib/friendlyError';

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
