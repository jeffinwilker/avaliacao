import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workbook = XLSX.utils.book_new();
  const customers = XLSX.utils.aoa_to_sheet([
    [
      "Nome",
      "Email",
      "Telefone",
      "CPF/CNPJ",
      "Data de nascimento",
      "Aceita marketing",
      "Ativo",
      "Observação",
    ],
    [
      "Maria da Silva",
      "maria@exemplo.com",
      "(11) 99999-9999",
      "123.456.789-00",
      "25/08/1990",
      "Sim",
      "Sim",
      "Cliente da loja física",
    ],
    [
      "João Souza",
      "",
      "(21) 98888-7777",
      "",
      "1992-04-10",
      "Não",
      "Sim",
      "",
    ],
  ]);
  customers["!cols"] = [
    { wch: 28 },
    { wch: 30 },
    { wch: 20 },
    { wch: 20 },
    { wch: 22 },
    { wch: 20 },
    { wch: 12 },
    { wch: 34 },
  ];
  customers["!autofilter"] = { ref: "A1:H3" };
  XLSX.utils.book_append_sheet(workbook, customers, "Clientes");

  const instructions = XLSX.utils.aoa_to_sheet([
    ["Como preencher o modelo"],
    ["Campo", "Orientação"],
    ["Nome", "Obrigatório."],
    ["Email ou Telefone", "Preencha pelo menos um dos dois campos."],
    ["Data de nascimento", "Use DD/MM/AAAA ou AAAA-MM-DD."],
    ["Aceita marketing", "Use Sim ou Não. Se ficar vazio, será considerado Sim."],
    ["Ativo", "Use Sim ou Não. Se ficar vazio, será considerado Sim."],
    ["Colunas", "Você poderá relacionar manualmente colunas com outros nomes antes de importar."],
    ["Duplicados", "Clientes com o mesmo e-mail ou telefone serão atualizados, não duplicados."],
  ]);
  instructions["!cols"] = [{ wch: 24 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "Instruções");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-importacao-clientes.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
