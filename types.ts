export type ResponseType = 'OK' | 'NG' | 'N/A';

export interface User {
  name: string;
  matricula: string;
  role: string; // Função
  shift?: string; // Turno (Novo)
  email?: string; // Optional
  password?: string; // Stored securely in real app, simulated here
  isAdmin?: boolean; // Novo campo para controle explícito de admin
}

export interface ChecklistItem {
  id: string;
  category: string; // Maps to 'Posto'
  text: string;     // Maps to 'Item'
  evidence?: string; // Maps to 'Evidencia'
  imageUrl?: string; // URL da imagem ilustrativa (Base64)
  type?: 'LEADER' | 'MAINTENANCE'; // Novo: Tipo de item
}

export interface ChecklistData {
  [key: string]: ResponseType;
}

export interface ChecklistEvidence {
    [key: string]: {
        comment: string;
        photo?: string;
    }
}

// Histórico para o Admin visualizar
export interface ChecklistLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  line: string; // Linha de produção
  date: string; // ISO String
  ngCount: number;
  observation: string;
  itemsCount: number;
  data: ChecklistData; 
  evidenceData?: ChecklistEvidence; // Evidências de NG
  type?: 'PRODUCTION' | 'MAINTENANCE'; // Tipo de checklist
  maintenanceTarget?: string; // Se for manutenção, qual máquina
}

export interface MeetingLog {
    id: string;
    title: string;
    date: string;
    startTime: string;
    endTime?: string;
    photoUrl: string;
    participants: string[];
    topics: string;
    createdBy: string;
}

export interface Permission {
    role: string;
    module: 'CHECKLIST' | 'MEETING' | 'MAINTENANCE' | 'AUDIT' | 'ADMIN';
    allowed: boolean;
}