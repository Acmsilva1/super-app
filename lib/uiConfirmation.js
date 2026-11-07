import { createFeedback } from '../components/ui/organisms/feedback.mjs';

const feedback = createFeedback();

/** Confirma uma ação concluída sem depender do scroll nem interromper o foco. */
export function showAppConfirmation(message = 'Alteração salva.') {
  if (typeof document === 'undefined' || !message) return;
  if (!document.getElementById('app-confirmation-style')) {
    const style = document.createElement('style');
    style.id = 'app-confirmation-style';
    style.textContent = `.app-confirmation { position:fixed; inset:0; z-index:2147483647; display:grid; place-items:center; pointer-events:none; padding:1rem; }
      .app-confirmation__card { display:flex; align-items:center; gap:.7rem; width:max-content; max-width:min(26rem,100%); box-sizing:border-box; padding:1rem 1.25rem; border:1px solid #95c11f; border-radius:1rem; background:#20463c; color:#fff; box-shadow:0 12px 40px #0006; font:600 .95rem/1.4 Arial,sans-serif; overflow-wrap:anywhere; }
      .app-confirmation__icon { flex:none; color:#c8da98; font-size:1.4rem; }`;
    document.head.append(style);
  }
  feedback.success(message);
}
