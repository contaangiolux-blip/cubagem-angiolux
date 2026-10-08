import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type Coluna = {
  key: string;
  label: string;
  kind: "text" | "num" | "int" | "bool" | "select";
  options?: { value: string; label: string }[];
  required?: boolean;
  min?: number;
  max?: number;
  className?: string;
  render?: (v: unknown) => ReactNode;
};

type Row = Record<string, unknown>;

const NONE = "";

function converter(col: Coluna, v: unknown): unknown {
  if (col.kind === "bool") return !!v;
  const s = v === null || v === undefined ? "" : String(v).trim();
  if (col.kind === "text") return s === "" ? null : s;
  if (s === "") return null;
  const n = Number(s.replace(",", "."));
  return col.kind === "int" ? Math.trunc(n) : n;
}

function exibir(col: Coluna, v: unknown): ReactNode {
  if (col.render) return col.render(v);
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (col.kind === "bool") return v ? "Sim" : "Não";
  if (col.kind === "num") return Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  if (col.kind === "select") return col.options?.find((o) => o.value === String(v))?.label ?? String(v);
  return String(v);
}

function Editor({ col, value, onChange, id }: { col: Coluna; value: unknown; onChange: (v: unknown) => void; id?: string }) {
  if (col.kind === "bool") return <Checkbox id={id} checked={!!value} onCheckedChange={(c) => onChange(!!c)} />;
  if (col.kind === "select")
    return (
      <select id={id} className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm" value={value === null || value === undefined ? NONE : String(value)} onChange={(e) => onChange(e.target.value === NONE ? null : e.target.value)}>
        {!col.required && <option value={NONE}>—</option>}
        {col.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  return (
    <Input id={id} className="h-8" type={col.kind === "text" ? "text" : "number"} step={col.kind === "int" ? 1 : "any"} min={col.min} max={col.max}
      value={value === null || value === undefined ? "" : String(value)} onChange={(e) => onChange(e.target.value)} />
  );
}

export function GradeEditavel({
  rows, colunas, pk, titulo, onSalvar, onExcluir,
}: {
  rows: Row[];
  colunas: Coluna[];
  pk: string;
  titulo: string;
  onSalvar: (row: Row, novo: boolean) => Promise<string | null>;
  onExcluir: (id: unknown) => Promise<string | null>;
}) {
  const [editId, setEditId] = useState<unknown>(null);
  const [draft, setDraft] = useState<Row>({});
  const [novo, setNovo] = useState<Row | null>(null);
  const [excluir, setExcluir] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  async function salvar(r: Row, isNovo: boolean) {
    const out: Row = {};
    for (const c of colunas) out[c.key] = converter(c, r[c.key]);
    for (const c of colunas) {
      if (c.required && (out[c.key] === null || out[c.key] === "")) { toast.error(`Preencha "${c.label}".`); return false; }
      if ((c.kind === "num" || c.kind === "int") && out[c.key] !== null && !Number.isFinite(out[c.key] as number)) { toast.error(`"${c.label}" inválido.`); return false; }
      if (c.min !== undefined && typeof out[c.key] === "number" && (out[c.key] as number) < c.min) { toast.error(`"${c.label}" deve ser ≥ ${c.min}.`); return false; }
      if (c.max !== undefined && typeof out[c.key] === "number" && (out[c.key] as number) > c.max) { toast.error(`"${c.label}" deve ser ≤ ${c.max}.`); return false; }
    }
    if (isNovo && rows.some((x) => String(x[pk]) === String(out[pk]))) { toast.error("Já existe um registro com este código."); return false; }
    setBusy(true);
    const err = await onSalvar(out, isNovo);
    setBusy(false);
    if (err) { toast.error(`Erro ao salvar: ${err}`); return false; }
    toast.success("Salvo");
    return true;
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setNovo(Object.fromEntries(colunas.map((c) => [c.key, c.kind === "bool" ? false : null])))}>
          <Plus className="mr-1 h-4 w-4" />{titulo}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {colunas.map((c) => <TableHead key={c.key} className={`whitespace-nowrap text-xs ${c.className ?? ""}`}>{c.label}</TableHead>)}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={colunas.length + 1} className="py-8 text-center text-muted-foreground">Nenhum registro.</TableCell></TableRow>}
            {rows.map((r) => {
              const id = r[pk];
              const editando = editId === id;
              return (
                <TableRow key={String(id)} className="align-top">
                  {colunas.map((c) => (
                    <TableCell key={c.key} className={`text-sm ${c.className ?? ""}`} onDoubleClick={() => { if (!editando) { setEditId(id); setDraft({ ...r }); } }}>
                      {editando && c.key !== pk
                        ? <Editor col={c} value={draft[c.key]} onChange={(v) => setDraft((d) => ({ ...d, [c.key]: v }))} />
                        : exibir(c, r[c.key])}
                    </TableCell>
                  ))}
                  <TableCell className="whitespace-nowrap">
                    {editando ? (
                      <>
                        <Button size="icon" variant="ghost" aria-label="Salvar" disabled={busy} onClick={async () => { if (await salvar(draft, false)) setEditId(null); }}><Check className="h-4 w-4 text-success" /></Button>
                        <Button size="icon" variant="ghost" aria-label="Cancelar" onClick={() => setEditId(null)}><X className="h-4 w-4" /></Button>
                      </>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => { setEditId(id); setDraft({ ...r }); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => setExcluir(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!novo} onOpenChange={(o) => !o && setNovo(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
          {novo && (
            <div className="grid gap-3 sm:grid-cols-2">
              {colunas.map((c) => (
                <div key={c.key} className={`space-y-1 ${c.kind === "text" && c.key !== pk ? "sm:col-span-2" : ""}`}>
                  <Label htmlFor={`novo-${c.key}`} className="text-xs">{c.label}{c.required ? " *" : ""}</Label>
                  <Editor id={`novo-${c.key}`} col={c} value={novo[c.key]} onChange={(v) => setNovo((d) => ({ ...d!, [c.key]: v }))} />
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovo(null)}>Cancelar</Button>
            <Button disabled={busy} onClick={async () => { if (novo && (await salvar(novo, true))) setNovo(null); }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro {excluir ? String(excluir[pk]) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (!excluir) return;
              const err = await onExcluir(excluir[pk]);
              if (err) toast.error(`Erro ao excluir: ${err}`); else toast.success("Excluído");
              setExcluir(null);
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
