import { toast } from "sonner";

/** Cópia pelo método antigo (campo oculto + Ctrl+C), para navegadores que bloqueiam a área de transferência moderna. */
function copiarAntigo(txt: string): boolean {
  const campo = document.createElement("textarea");
  campo.value = txt;
  campo.setAttribute("readonly", "");
  campo.style.position = "fixed";
  campo.style.opacity = "0";
  document.body.appendChild(campo);
  campo.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  campo.remove();
  return ok;
}

export function copiar(txt: string) {
  const avisar = (ok: boolean) => (ok ? toast.success(`Copiado: ${txt.length > 30 ? "texto" : txt}`) : toast.error("Não foi possível copiar"));
  if (!navigator.clipboard?.writeText) {
    avisar(copiarAntigo(txt));
    return;
  }
  navigator.clipboard.writeText(txt).then(() => avisar(true), () => avisar(copiarAntigo(txt)));
}
