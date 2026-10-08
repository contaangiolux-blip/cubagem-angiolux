import { toast } from "sonner";
export function copiar(txt: string) {
  navigator.clipboard.writeText(txt).then(() => toast.success("Copiado"), () => toast.error("Não foi possível copiar"));
}
