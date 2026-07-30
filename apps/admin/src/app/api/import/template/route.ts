import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";

// Gera um XLSX de exemplo para o usuário entender a estrutura esperada
// no importador. Inclui cabeçalhos + linhas de exemplo + uma aba
// separada com instruções.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataRows = [
    {
      Produto: "Camiseta Azul Tamanho M",
      Cliente: "Mariana Silva",
      "E-mail": "mariana@example.com",
      Nota: 5,
      Título: "Adorei!",
      Comentário:
        "Chegou super rápido, embalagem caprichada e a qualidade é excelente. Recomendo!",
      Data: "2025-08-14",
      Verificada: "sim",
    },
    {
      Produto: "Tênis Esportivo Preto 42",
      Cliente: "João Pedro",
      "E-mail": "joao@example.com",
      Nota: 4,
      Título: "Bom, mas demorou",
      Comentário:
        "Produto ótimo, só achei que a entrega demorou um pouco. Fora isso, perfeito.",
      Data: "2025-09-02",
      Verificada: "sim",
    },
    {
      Produto: "Boné trucker branco",
      Cliente: "Ana Carolina",
      "E-mail": "",
      Nota: 5,
      Título: "",
      Comentário: "Simplesmente perfeito.",
      Data: "2025-10-10",
      Verificada: "não",
    },
  ];

  const wb = XLSX.utils.book_new();

  const wsData = XLSX.utils.json_to_sheet(dataRows, {
    header: [
      "Produto",
      "Cliente",
      "E-mail",
      "Nota",
      "Título",
      "Comentário",
      "Data",
      "Verificada",
    ],
  });
  wsData["!cols"] = [
    { wch: 40 },
    { wch: 22 },
    { wch: 28 },
    { wch: 6 },
    { wch: 22 },
    { wch: 60 },
    { wch: 14 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, wsData, "Avaliações");

  // Aba de instruções
  const instructions = [
    ["Campo", "Obrigatório?", "Descrição", "Exemplo"],
    ["Produto", "Sim", "Nome do produto (o sistema faz de-para automático por similaridade com o catálogo)", "Camiseta Azul Tamanho M"],
    ["Cliente", "Sim", "Nome de quem escreveu a avaliação", "Mariana Silva"],
    ["E-mail", "Não", "E-mail do cliente (opcional)", "mariana@example.com"],
    ["Nota", "Sim", "Número inteiro de 1 a 5", "5"],
    ["Título", "Não", "Título curto da avaliação (até 120 chars)", "Adorei!"],
    ["Comentário", "Não", "Texto completo da avaliação (até 1500 chars)", "Chegou super rápido..."],
    ["Data", "Não", "Data da avaliação. Formatos aceitos: 2025-08-14, 14/08/2025, ISO. Se vazio, usa a data de hoje.", "2025-08-14"],
    ["Verificada", "Não", "Marca como 'compra verificada'. Aceita: sim / não / true / false / 1 / 0", "sim"],
    [],
    ["Dicas:", "", "", ""],
    ["", "", "• Nomes de colunas podem variar (o sistema reconhece 'produto', 'product', 'nota', 'rating', 'stars', 'comentário', 'review' etc.).", ""],
    ["", "", "• Se algum produto da planilha não bater com nenhum do catálogo, você resolve manualmente na tela de importação.", ""],
    ["", "", "• Você escolhe se as avaliações entram já publicadas ou pendentes (a decidir no momento do import).", ""],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 80 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instruções");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const blob = new Blob([new Uint8Array(buf)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Disposition": `attachment; filename="modelo-importacao-avaliacoes.xlsx"`,
    },
  });
}
