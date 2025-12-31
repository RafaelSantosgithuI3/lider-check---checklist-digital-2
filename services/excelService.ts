
import ExcelJS from 'exceljs';
import { ChecklistData, User, ChecklistItem, ChecklistLog, MeetingLog } from '../types';
import { getLogs, getLogsByWeekSyncStrict, saveBackupToServer } from './storageService';
import { getAllUsers } from './authService';

// Função para backup no servidor (Admin)
export const generateAndSaveBackup = async (
    line: string, 
    shift: string, 
    date: Date, 
    items: ChecklistItem[]
) => {
    const allLogs = await getLogs();
    const allUsers = await getAllUsers(); // Necessário para checar turnos

    // Gerar buffer
    const buffer = await createExcelBuffer(line, shift, date, items, allLogs, allUsers);
    
    // Converter para Base64
    const blob = new Blob([buffer]);
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
        reader.onloadend = async () => {
            const base64data = reader.result as string;
            const week = getWeekNumber(date);
            const fileName = `BACKUP_${line}_T${shift}_W${week}_${date.getFullYear()}.xlsx`;
            
            try {
                const res = await saveBackupToServer(fileName, base64data);
                resolve(res);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

// Função para download no cliente (Botão Linhas)
export const downloadShiftExcel = async (
    line: string,
    shift: string,
    dateStr: string, // YYYY-WW format or date string
    items: ChecklistItem[]
) => {
    // Converter string de semana/data para objeto Date
    let dateObj = new Date();
    if (dateStr.includes('-W')) {
        const parts = dateStr.split('-W');
        const year = parseInt(parts[0]);
        const week = parseInt(parts[1]);
        const simpleDate = new Date(year, 0, 1 + (week - 1) * 7);
        dateObj = simpleDate;
    } else {
        dateObj = new Date(dateStr);
    }

    const allLogs = await getLogs();
    const allUsers = await getAllUsers();

    const buffer = await createExcelBuffer(line, shift, dateObj, items, allLogs, allUsers);
    
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Checklist_${line}_Turno${shift}_W${getWeekNumber(dateObj)}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);
}

// Lógica original para exportação de UM log individual (Dashboard Pessoal / Histórico)
export const exportLogToExcel = async (log: ChecklistLog, items: ChecklistItem[]) => {
    const user: User = {
        name: log.userName,
        matricula: log.userId,
        role: log.userRole,
        shift: '', 
        email: ''
    };
    const allLogs = await getLogs();
    const allUsers = await getAllUsers();
    
    // Tenta descobrir o turno deste usuário específico
    const fullUser = allUsers.find(u => u.matricula === log.userId);
    const shift = fullUser ? fullUser.shift : '2'; // Fallback

    exportToExcelLegacy(log, user, items, allLogs, shift || '2', allUsers);
}

// ATA DE REUNIÃO EXPORT
export const exportMeetingToExcel = async (meeting: MeetingLog) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ata de Reunião');

    worksheet.mergeCells('A1:E1');
    const title = worksheet.getCell('A1');
    title.value = `ATA DE REUNIÃO: ${meeting.title || 'Sem Título'}`;
    title.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };

    // Info Header
    worksheet.mergeCells('A2:E2');
    worksheet.getCell('A2').value = `DATA: ${new Date(meeting.date).toLocaleDateString()} | HORÁRIO: ${meeting.startTime}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };
    
    worksheet.getRow(3).height = 10;

    // Foto
    worksheet.mergeCells('A4:E15');
    const photoPlace = worksheet.getCell('A4');
    photoPlace.value = "FOTO DA REUNIÃO";
    photoPlace.alignment = { vertical: 'top', horizontal: 'center' };
    photoPlace.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

    if (meeting.photoUrl) {
         const base64Clean = meeting.photoUrl.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");
         const imageId = workbook.addImage({
            base64: base64Clean,
            extension: 'png',
         });
         worksheet.addImage(imageId, {
            tl: { col: 0, row: 3 }, // A4
            ext: { width: 400, height: 250 },
            editAs: 'oneCell'
         });
    }

    // Participantes
    worksheet.mergeCells('A16:E16');
    worksheet.getCell('A16').value = "PARTICIPANTES";
    worksheet.getCell('A16').font = { bold: true };
    worksheet.getCell('A16').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

    let currentRow = 17;
    meeting.participants.forEach(p => {
        worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
        worksheet.getCell(`A${currentRow}`).value = `• ${p}`;
        currentRow++;
    });

    currentRow++;
    
    // Assuntos
    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = "ASSUNTOS TRATADOS";
    worksheet.getCell(`A${currentRow}`).font = { bold: true };
    worksheet.getCell(`A${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    currentRow++;

    worksheet.mergeCells(`A${currentRow}:E${currentRow+5}`);
    const topicsCell = worksheet.getCell(`A${currentRow}`);
    topicsCell.value = meeting.topics;
    topicsCell.alignment = { wrapText: true, vertical: 'top' };
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ATA_REUNIAO_${meeting.date}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);
}

const getWeekNumber = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

// Função CORE que gera o Excel (compartilhada)
const createExcelBuffer = async (
    lineName: string,
    shiftName: string,
    dateObj: Date,
    items: ChecklistItem[],
    allLogs: ChecklistLog[],
    allUsers: User[]
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Checklist');
  
  // Filtra logs estritamente por LINHA, TURNO e DATA(SEMANA)
  const weeklyLogs = getLogsByWeekSyncStrict(allLogs, dateObj, lineName, shiftName, allUsers);
  
  const logsByDay: {[key: number]: ChecklistLog} = {};
  weeklyLogs.forEach(l => {
      const d = new Date(l.date).getDay();
      logsByDay[d] = l;
  });

  const weekNum = getWeekNumber(dateObj);
  const monthName = dateObj.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
  const yearNum = dateObj.getFullYear();

  // --- CABEÇALHO PADRÃO ---
  
  // Título Principal
  worksheet.mergeCells('A1:J1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `RELATÓRIO SEMANAL DE CHECKLIST - LIDERANÇA`;
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Blue
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Sub-título com Infos (Adicionado ANO)
  worksheet.mergeCells('A2:J2');
  const infoCell = worksheet.getCell('A2');
  infoCell.value = `LINHA: ${lineName} | TURNO: ${shiftName} | SEMANA: ${weekNum} | MÊS: ${monthName} | ANO: ${yearNum}`;
  infoCell.font = { name: 'Arial', size: 11, bold: true };
  infoCell.alignment = { horizontal: 'center', vertical: 'middle' };
  infoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

  // Espaçamento
  worksheet.getRow(3).height = 10;

  // --- COLUNAS ---
  worksheet.columns = [
      { key: 'num', width: 6 },     // A: Nº
      { key: 'cat', width: 15 },    // B: Categoria
      { key: 'item', width: 50 },   // C: Item
      { key: 'evid', width: 25 },   // D: Evidência / Imagem
      { key: 'seg', width: 12 },    // E: Seg
      { key: 'ter', width: 12 },    // F: Ter
      { key: 'qua', width: 12 },    // G: Qua
      { key: 'qui', width: 12 },    // H: Qui
      { key: 'sex', width: 12 },    // I: Sex
      { key: 'sab', width: 12 },    // J: Sab
  ];

  // --- CABEÇALHO DA TABELA ---
  const headerRow = worksheet.getRow(4);
  headerRow.values = ['ID', 'CATEGORIA', 'ITEM DE VERIFICAÇÃO', 'EVIDÊNCIA / FOTO', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  headerRow.height = 25;
  
  headerRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } }; // Dark Gray
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
          top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'}
      };
  });

  // --- DADOS ---
  let currentRow = 5;

  const centerStyle: Partial<ExcelJS.Style> = {
    alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }
  };
  
  const leftStyle: Partial<ExcelJS.Style> = {
    alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }
  };
  
  for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const row = worksheet.getRow(currentRow);
      
      const sSeg = logsByDay[1]?.data[item.id] || '';
      const sTer = logsByDay[2]?.data[item.id] || '';
      const sQua = logsByDay[3]?.data[item.id] || '';
      const sQui = logsByDay[4]?.data[item.id] || '';
      const sSex = logsByDay[5]?.data[item.id] || '';
      const sSab = logsByDay[6]?.data[item.id] || '';

      let itemText = item.text;
      if (item.evidence && item.evidence.length > 3) {
           itemText += `\n(Ref: ${item.evidence})`;
      }

      row.values = [
          index + 1,        
          item.category,    
          itemText,        
          '', // Coluna de Evidência (para imagem)
          sSeg, sTer, sQua, sQui, sSex, sSab
      ];

      // Formatação Base
      row.eachCell((cell, colNum) => {
          cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
          
          // Coluna A (Index 1): Fundo Cinza (#4B5563), Texto Branco
          if (colNum === 1) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B5563' } };
              cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
              cell.style = centerStyle;
          } 
          // Restante das Colunas (B até J) - Fundo Branco
          else {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // Branco
              
              // Estilo de alinhamento
              if (colNum === 2 || colNum === 3) { // Categoria e Item
                  cell.style = leftStyle;
                  cell.font = { color: { argb: 'FF000000' } }; // Preto
              } else {
                  cell.style = centerStyle;
              }

              // Coloração Condicional da LETRA (TEXTO) para colunas D a J (Evidência + Dias)
              // Índices 4 a 10
              if (colNum >= 4 && colNum <= 10) {
                  const val = cell.value?.toString();
                  
                  if (val === 'NG') {
                      cell.font = { color: { argb: 'FFFF0000' }, bold: true }; // Vermelho
                  } else if (val === 'OK') {
                      cell.font = { color: { argb: 'FF008000' }, bold: true }; // Verde
                  } else if (val === 'N/A') {
                      cell.font = { color: { argb: 'FFD4AC0D' }, bold: true }; // Amarelo Escuro (Dourado) para ler no branco
                  } else {
                      cell.font = { color: { argb: 'FF000000' } }; // Preto Padrão
                  }
              }
          }
      });

       // --- INSERÇÃO DA IMAGEM DE REFERÊNCIA ---
      if (item.imageUrl) {
          try {
            // Ajustar altura da linha para caber a imagem
            row.height = 60; 

            // Remover prefixo base64 se existir (data:image/png;base64,...)
            const base64Clean = item.imageUrl.replace(/^data:image\/(png|jpg|jpeg);base64,/, "");
            
            const imageId = workbook.addImage({
                base64: base64Clean,
                extension: 'png', 
            });

            // Inserir na coluna D (Evidência), indice 3 (0-based) na API addImage
            worksheet.addImage(imageId, {
                tl: { col: 3, row: currentRow - 1 }, // Coluna D é index 3. Row é 0-based.
                ext: { width: 80, height: 80 },
                editAs: 'oneCell'
            });
          } catch (err) {
              console.error("Erro ao adicionar imagem ao Excel:", err);
          }
      }

      currentRow++;
  }

  // --- RODAPÉ: RESPONSÁVEL ---
  // Listar quem fez o check em cada dia
  currentRow++;
  
  const daysMap = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const responsibles = [];
  for(let i=1; i<=6; i++) {
      if(logsByDay[i]) responsibles.push(`${daysMap[i]}: ${logsByDay[i].userName}`);
  }

  if (responsibles.length > 0) {
      worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
      const respCell = worksheet.getCell(`A${currentRow}`);
      respCell.value = 'RESPONSÁVEIS: ' + responsibles.join(' | ');
      respCell.font = { italic: true, size: 9, color: { argb: 'FF666666' } };
      respCell.alignment = { horizontal: 'left' };
      respCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }; // Branco
  }
  
  return await workbook.xlsx.writeBuffer();
};

// Wrapper para compatibilidade com o botão "Download" do histórico individual
const exportToExcelLegacy = async (
    currentLog: ChecklistLog,
    user: User, 
    items: ChecklistItem[],
    allLogs: ChecklistLog[],
    shift: string,
    allUsers: User[]
) => {
    const dateObj = new Date(currentLog.date);
    const line = currentLog.line || 'TP_TNP_03';
    
    const buffer = await createExcelBuffer(line, shift, dateObj, items, allLogs, allUsers);

    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Checklist_${line}_Legacy.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);
};
