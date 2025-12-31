import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Card } from './components/Card';
import { Button } from './components/Button';
import { Input } from './components/Input';
import { User, ChecklistData, ResponseType, ChecklistItem, ChecklistLog, MeetingLog, ChecklistEvidence, Permission } from './types';
import { 
    loginUser, logoutUser, getSessionUser, seedAdmin, isAdmin, 
    getAllUsers, deleteUser, updateUser, registerUser, updateSessionUser, recoverPassword
} from './services/authService';
import { exportLogToExcel, downloadShiftExcel, exportMeetingToExcel } from './services/excelService';
import { 
    getChecklistItems, saveChecklistItems, saveLog, getLogs, 
    getLines, saveLines, getLogsByWeekNumber,
    getRoles, saveRoles, fileToBase64, getManausDate,
    saveMeeting, getMeetings, getMaintenanceItems,
    getAllChecklistItemsRaw, getPermissions, savePermissions,
    getTodayLogForUser
} from './services/storageService';
import { saveServerUrl, getServerUrl, clearServerUrl, isServerConfigured } from './services/networkConfig';
import { 
  CheckSquare, LogOut, UserPlus, LogIn, CheckCircle2, AlertCircle, 
  Save, ArrowLeft, History, Edit3, Trash2, Plus, Image as ImageIcon, 
  Settings, Users, List, Search, Calendar, Eye, Download, Wifi, User as UserIcon, Upload, X, UserCheck,
  Camera, FileText, QrCode, Hammer, AlertTriangle, Shield
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

type ViewState = 'SETUP' | 'LOGIN' | 'REGISTER' | 'RECOVER' | 'MENU' | 'CHECKLIST_MENU' | 'AUDIT_MENU' | 'DASHBOARD' | 'ADMIN' | 'SUCCESS' | 'PERSONAL' | 'PROFILE' | 'MEETING_MENU' | 'MEETING_FORM' | 'MEETING_HISTORY' | 'MAINTENANCE_QR';

interface LineStatus {
    status: 'OK' | 'NG' | 'PENDING';
    leaderName?: string;
    logIds: string[]; 
}

interface LeaderStatus {
    user: User;
    statuses: { date: string, status: 'OK' | 'NG' | 'PENDING', logId?: string }[];
}

const App = () => {
  // --- State ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>('SETUP');
  const [isLoading, setIsLoading] = useState(false);
  
  // Network Setup
  const [serverIp, setServerIp] = useState('');

  // Auth States
  const [loginMatricula, setLoginMatricula] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Register States
  const [regName, setRegName] = useState('');
  const [regMatricula, setRegMatricula] = useState('');
  const [regRole, setRegRole] = useState('');
  const [regShift, setRegShift] = useState('1');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  
  // Permissions State
  const [permissions, setPermissions] = useState<Permission[]>([]);

  // Checklist
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [lines, setLines] = useState<string[]>([]); 
  const [checklistData, setChecklistData] = useState<ChecklistData>({});
  const [checklistEvidence, setChecklistEvidence] = useState<ChecklistEvidence>({}); 
  const [observation, setObservation] = useState('');
  const [currentLogId, setCurrentLogId] = useState<string | null>(null);
  const [currentLine, setCurrentLine] = useState(''); 
  const [showLinePrompt, setShowLinePrompt] = useState(false);
  
  // Maintenance Mode
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [maintenanceTarget, setMaintenanceTarget] = useState('');

  // Meeting States
  const [meetingParticipants, setMeetingParticipants] = useState<string[]>([]);
  const [newParticipant, setNewParticipant] = useState('');
  const [meetingTopics, setMeetingTopics] = useState('');
  const [meetingPhoto, setMeetingPhoto] = useState('');
  const [meetingTitle, setMeetingTitle] = useState(''); 
  const [meetingHistory, setMeetingHistory] = useState<MeetingLog[]>([]);

  // Admin / Audit
  const [adminTab, setAdminTab] = useState<'USERS' | 'LINES' | 'ROLES' | 'PERMISSIONS'>('USERS');
  const [auditTab, setAuditTab] = useState<'LEADER_HISTORY' | 'MAINTENANCE_HISTORY' | 'LEADER_EDITOR' | 'MAINTENANCE_EDITOR' | 'LEADERS' | 'LINES'>('LEADER_HISTORY');
  const [historyLogs, setHistoryLogs] = useState<ChecklistLog[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  
  // Audit Editors
  const [leaderItems, setLeaderItems] = useState<ChecklistItem[]>([]);
  const [maintenanceItems, setMaintenanceItems] = useState<ChecklistItem[]>([]);

  // Admin User Edit
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showUserEditModal, setShowUserEditModal] = useState(false);
  const [originalMatriculaEdit, setOriginalMatriculaEdit] = useState('');
  
  // Audit Lines Dashboard
  const [linesWeekFilter, setLinesWeekFilter] = useState<string>(''); 
  const [linesShiftFilter, setLinesShiftFilter] = useState('1'); 
  const [linesMatrix, setLinesMatrix] = useState<{line: string, statuses: LineStatus[]}[]>([]);
  const [newLineName, setNewLineName] = useState('');
  const [newRoleName, setNewRoleName] = useState('');

  // Audit Leaders Dashboard
  const [leadersMatrix, setLeadersMatrix] = useState<LeaderStatus[]>([]);
  const [missingLeadersNames, setMissingLeadersNames] = useState<string[]>([]);

  // Preview / Personal
  const [personalLogs, setPersonalLogs] = useState<ChecklistLog[]>([]);
  const [previewLog, setPreviewLog] = useState<ChecklistLog | null>(null);

  // Profile Edit
  const [profileData, setProfileData] = useState<User | null>(null);

  // QR Logic
  const [qrCodeManual, setQrCodeManual] = useState('');

  // Refs
  const categoryRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Derived State
  const isSuperAdmin = currentUser ? (currentUser.matricula === 'admin' || currentUser.role === 'TI') : false;

  // --- PERMISSION HELPERS ---
  const hasPermission = (module: 'CHECKLIST' | 'MEETING' | 'MAINTENANCE' | 'AUDIT' | 'ADMIN') => {
      if(!currentUser) return false;
      if(isAdmin(currentUser)) return true; // Super Admin always has access
      
      const perm = permissions.find(p => p.role === currentUser.role && p.module === module);
      if(perm) return perm.allowed;
      
      // Defaults if not configured
      if(module === 'CHECKLIST') return true; 
      if(module === 'MEETING') return true; 
      if(module === 'MAINTENANCE') return true; 
      if(module === 'AUDIT' || module === 'ADMIN') return false; 
      
      return false;
  }

  // Helper for week number
  function getWeekNumber(d: Date) {
      d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
      return weekNo;
  }

  // Helper to open calendar popup on click
  const showPicker = (e: React.MouseEvent<HTMLInputElement>) => {
      try {
          if ('showPicker' in HTMLInputElement.prototype) {
              e.currentTarget.showPicker();
          }
      } catch (error) {
          // Fallback or ignore if not supported
      }
  };

  // --- Effects ---
  useEffect(() => {
    if (isServerConfigured()) {
        const storedIp = getServerUrl();
        if (storedIp) setServerIp(storedIp);
        initApp();
    } else {
        setServerIp('http://localhost:3000');
        setView('SETUP');
    }
  }, []);

  const initApp = async () => {
      setIsLoading(true);
      try {
        await seedAdmin(); 
        const user = getSessionUser();
        
        // Initial load of config
        const loadLines = await getLines();
        setLines(loadLines);
        const loadRoles = await getRoles();
        setAvailableRoles(loadRoles);
        if (loadRoles.length > 0 && !user) setRegRole(loadRoles[0]); // Only set default reg role if not logged in
        
        const perms = await getPermissions();
        setPermissions(perms);

        const now = getManausDate();
        setLinesWeekFilter(`${now.getFullYear()}-W${getWeekNumber(now).toString().padStart(2, '0')}`);

        if (user) {
            setCurrentUser(user);
            setView('MENU');
        } else {
            // Se não tiver usuário (ou for inicialização limpa), garantir que campos estão vazios
            setLoginMatricula('');
            setLoginPassword('');
            setView('LOGIN');
        }
      } catch (e) {
          console.error("Erro ao inicializar:", e);
          alert("Não foi possível conectar ao servidor. Verifique o IP.");
          setView('SETUP');
      } finally {
          setIsLoading(false);
      }
  }

  // Initialize Items based on Mode (Maintenance or Production)
  useEffect(() => {
      const loadItems = async () => {
          if (view === 'DASHBOARD') {
            setIsLoading(true);
            let loadedItems: ChecklistItem[] = [];
            if (isMaintenanceMode) {
                // Load maintenance items for target
                loadedItems = await getMaintenanceItems(maintenanceTarget);
            } else {
                // Load production items
                loadedItems = await getChecklistItems('LEADER');
            }
            setItems(loadedItems);
            // Update Categories
            const cats = Array.from(new Set(loadedItems.map(i => i.category)));
            setCategories(cats);
            setIsLoading(false);
          }
      };
      loadItems();
  }, [view, isMaintenanceMode, maintenanceTarget]);


  // History & Editors Filter Effect
  useEffect(() => {
      const fetchAuditData = async () => {
          if (view === 'AUDIT_MENU') {
              setIsLoading(true);
              
              // Load Logs
              if (auditTab === 'LEADER_HISTORY' || auditTab === 'MAINTENANCE_HISTORY') {
                  const allLogs = await getLogs();
                  let filteredLogs = allLogs;
                  
                  if (auditTab === 'MAINTENANCE_HISTORY') {
                      filteredLogs = allLogs.filter(l => l.type === 'MAINTENANCE');
                  } else {
                      filteredLogs = allLogs.filter(l => l.type !== 'MAINTENANCE');
                  }

                  if (historyDateFilter) {
                      filteredLogs = filteredLogs.filter(l => l.date.substring(0, 10) === historyDateFilter);
                  }
                  setHistoryLogs(filteredLogs);
              }
              
              // Load Editors
              if (auditTab === 'LEADER_EDITOR') {
                  const items = await getChecklistItems('LEADER');
                  setLeaderItems(items);
              }
              
              if (auditTab === 'MAINTENANCE_EDITOR') {
                  const items = await getChecklistItems('MAINTENANCE');
                  setMaintenanceItems(items);
              }

              setIsLoading(false);
          }
      }
      fetchAuditData();
  }, [view, auditTab, historyDateFilter]);

  // Leaders Dashboard Matrix Logic (Check who did checklist today/week)
  useEffect(() => {
      const fetchLeadersMatrix = async () => {
          if (view === 'AUDIT_MENU') {
               // Calculate missing today (Alert) with Time Logic
               const allLogs = await getLogs();
               const allUsers = await getAllUsers();
               
               const now = getManausDate();
               const todayStr = now.toISOString().split('T')[0];
               const currentMinutes = now.getHours() * 60 + now.getMinutes();

               const SHIFT_1_START = 7 * 60 + 30;  // 07:30 = 450 minutes
               const SHIFT_2_START = 17 * 60 + 30; // 17:30 = 1050 minutes

               const leaders = allUsers.filter(u => 
                   u.role.toLowerCase().includes('lider') || 
                   u.role.toLowerCase().includes('líder') ||
                   u.role.toLowerCase().includes('supervisor') ||
                   u.role.toLowerCase().includes('coordenador')
               );

               const pendingList = leaders.filter(leader => {
                   const hasLog = allLogs.some(l => l.userId === leader.matricula && l.date.startsWith(todayStr));
                   if (hasLog) return false;

                   // Lógica de Horário para Alerta
                   if (leader.shift === '1') {
                       return currentMinutes >= SHIFT_1_START;
                   } else if (leader.shift === '2') {
                       return currentMinutes >= SHIFT_2_START;
                   }
                   return true;
               }).map(l => l.name);

               setMissingLeadersNames(pendingList);

               // Build Matrix for LEADERS tab
               if (auditTab === 'LEADERS' && linesWeekFilter) {
                   const parts = linesWeekFilter.split('-W');
                   if (parts.length !== 2) return;
                   const year = parseInt(parts[0]);
                   const week = parseInt(parts[1]);

                   const simpleDate = new Date(year, 0, 1 + (week - 1) * 7);
                   const day = simpleDate.getDay();
                   const diff = simpleDate.getDate() - day + (day === 0 ? -6 : 1);
                   const monday = new Date(simpleDate);
                   monday.setDate(diff);

                   const weekDates: string[] = [];
                   for(let i=0; i<6; i++) {
                       const d = new Date(monday);
                       d.setDate(monday.getDate() + i);
                       weekDates.push(d.toISOString().split('T')[0]);
                   }
                   
                   const weekLogs = await getLogsByWeekNumber(year, week, linesShiftFilter, allUsers);
                   const todayManaus = getManausDate().toISOString().split('T')[0];

                   const matrix = leaders.map(leader => {
                       const statuses = weekDates.map(dateStr => {
                           const log = weekLogs.find(l => l.userId === leader.matricula && l.date.startsWith(dateStr));
                           if (log) return { date: dateStr, status: 'OK', logId: log.id } as const;
                           
                           if (dateStr < todayManaus) return { date: dateStr, status: 'NG' } as const;
                           return { date: dateStr, status: 'PENDING' } as const;
                       });
                       return { user: leader, statuses };
                   });
                   setLeadersMatrix(matrix);
               }
          }
      };
      fetchLeadersMatrix();
  }, [view, auditTab, linesWeekFilter, linesShiftFilter]);

  // Matrix Logic (Lines)
  useEffect(() => {
      const fetchMatrix = async () => {
        if (view === 'AUDIT_MENU' && auditTab === 'LINES') {
            if (!linesWeekFilter) return;

            const parts = linesWeekFilter.split('-W');
            if (parts.length !== 2) return;
            const year = parseInt(parts[0]);
            const week = parseInt(parts[1]);

            const simpleDate = new Date(year, 0, 1 + (week - 1) * 7);
            const day = simpleDate.getDay();
            const diff = simpleDate.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(simpleDate);
            monday.setDate(diff);

            const weekDates: string[] = [];
            for(let i=0; i<6; i++) {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                weekDates.push(d.toISOString().split('T')[0]);
            }

            setIsLoading(true);
            const allUsers = await getAllUsers();
            const weekLogs = await getLogsByWeekNumber(year, week, linesShiftFilter, allUsers);

            const matrix = lines.map(line => {
                const lineStatuses = weekDates.map(dateStr => {
                    // Filtrar logs que correspondem à data e linha
                    const logsForDay = weekLogs.filter(l => (l.line === line) && l.date.startsWith(dateStr));
                    
                    if (logsForDay.length === 0) return { status: 'PENDING', logIds: [] } as LineStatus;
                    
                    const anyNg = logsForDay.some(l => l.ngCount > 0);
                    const status: 'OK' | 'NG' = anyNg ? 'NG' : 'OK';
                    
                    const uniqueNames = Array.from(new Set(logsForDay.map(l => l.userName.split(' ')[0])));
                    const leaderName = uniqueNames.join(' / ');
                    const logIds = logsForDay.map(l => l.id);

                    return { status, leaderName, logIds } as LineStatus;
                });
                return { line, statuses: lineStatuses };
            });
            setLinesMatrix(matrix);
            setIsLoading(false);
        }
      }
      fetchMatrix();
  }, [view, auditTab, linesWeekFilter, linesShiftFilter, lines]);

  // Meeting History Load
  useEffect(() => {
      if (view === 'MEETING_HISTORY') {
          const loadMeetings = async () => {
              setIsLoading(true);
              const data = await getMeetings();
              setMeetingHistory(data);
              setIsLoading(false);
          }
          loadMeetings();
      }
  }, [view]);

  // QR Reader Logic
  useEffect(() => {
      if (view === 'MAINTENANCE_QR') {
          setTimeout(() => {
              const scanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                false
              );
              scanner.render(onScanSuccess, onScanFailure);
              
              function onScanSuccess(decodedText: string, decodedResult: any) {
                  scanner.clear();
                  handleMaintenanceCode(decodedText);
              }
              function onScanFailure(error: any) {
              }
          }, 500);
      }
  }, [view]);

  // --- Handlers ---
  
  // Custom Logout to clear states
  const handleLogout = () => {
      logoutUser();
      setLoginMatricula('');
      setLoginPassword('');
      setView('LOGIN');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regMatricula || !regRole || !regPassword || !regShift) {
      setRegError('Preencha os campos obrigatórios.');
      return;
    }

    const newUser: User = {
      name: regName,
      matricula: regMatricula,
      role: regRole,
      shift: regShift,
      email: regEmail,
      password: regPassword,
      isAdmin: false
    };

    setIsLoading(true);
    const result = await registerUser(newUser);
    setIsLoading(false);

    if (result.success) {
      alert('Cadastro realizado com sucesso!');
      setView('LOGIN');
      setRegName(''); setRegMatricula(''); setRegShift('1'); setRegEmail(''); setRegPassword(''); setRegError('');
    } else {
      setRegError(result.message);
    }
  };

  const handleStartChecklist = () => {
      setIsMaintenanceMode(false);
      setMaintenanceTarget('');
      // FIX: Set Default Line Immediately
      setCurrentLine(lines.length > 0 ? lines[0] : '');
      setShowLinePrompt(true);
  }

  const handleConfirmLine = async () => {
      if(!currentLine) {
          alert("Por favor, selecione uma linha.");
          return;
      }
      setShowLinePrompt(false);
      setChecklistData({});
      setChecklistEvidence({});
      setObservation('');
      setCurrentLogId(null);
      setView('DASHBOARD');
  }

  const handleMaintenanceCode = (code: string) => {
      setIsMaintenanceMode(true);
      setMaintenanceTarget(code); // Machine ID
      setCurrentLine(code); // For logs
      setChecklistData({});
      setChecklistEvidence({});
      setObservation('');
      setCurrentLogId(null);
      setView('DASHBOARD');
  }

  const handleDownloadSheet = async (line: string) => {
      if (linesShiftFilter === 'ALL') {
          return alert("Selecione um turno específico (1 ou 2) para baixar a planilha.");
      }
      setIsLoading(true);
      try {
          await downloadShiftExcel(line, linesShiftFilter, linesWeekFilter, items);
      } catch (e) {
          alert("Erro ao gerar planilha.");
          console.error(e);
      } finally {
          setIsLoading(false);
      }
  }

  const handleOpenPersonalHistory = async () => {
      if (!currentUser) return;
      setIsLoading(true);
      const allLogs = await getLogs();
      const myLogs = allLogs.filter(l => l.userId === currentUser.matricula);
      setPersonalLogs(myLogs);
      setIsLoading(false);
      setView('PERSONAL');
  }

  const handleOpenPreview = async (logId: string) => {
      const allLogs = await getLogs();
      const log = allLogs.find(l => l.id === logId);
      if (log) setPreviewLog(log);
  }

  // --- NG Evidence Handlers ---
  const handleNgComment = (itemId: string, text: string) => {
      setChecklistEvidence(prev => ({
          ...prev,
          [itemId]: { ...prev[itemId], comment: text }
      }));
  }

  const handleNgPhoto = async (itemId: string, file: File) => {
      try {
          const base64 = await fileToBase64(file);
          setChecklistEvidence(prev => ({
              ...prev,
              [itemId]: { ...prev[itemId], photo: base64 }
          }));
      } catch (e) { alert("Erro ao carregar foto"); }
  }

  // --- Meeting Handlers ---
  const handleAddParticipant = () => {
      if (newParticipant) {
          setMeetingParticipants(prev => [...prev, newParticipant]);
          setNewParticipant('');
      }
  }
  
  const handleRemoveParticipant = (idx: number) => {
      setMeetingParticipants(prev => prev.filter((_, i) => i !== idx));
  }

  const handleMeetingPhoto = async (file: File) => {
      try {
          const base64 = await fileToBase64(file);
          setMeetingPhoto(base64);
      } catch (e) { alert("Erro na foto"); }
  }

  const handleSaveMeeting = async () => {
      if (!currentUser || meetingParticipants.length === 0 || !meetingTopics || !meetingTitle) {
          return alert("Preencha o título, participantes e assuntos.");
      }
      setIsLoading(true);
      try {
        const now = getManausDate();
        const newMeeting: MeetingLog = {
            id: Date.now().toString(),
            title: meetingTitle,
            date: now.toISOString(),
            startTime: now.toLocaleTimeString(),
            participants: meetingParticipants,
            topics: meetingTopics,
            photoUrl: meetingPhoto,
            createdBy: currentUser.name
        };
        await saveMeeting(newMeeting);
        alert("Ata salva com sucesso!");
        // Limpar form
        setMeetingParticipants([]); setMeetingTopics(''); setMeetingPhoto(''); setMeetingTitle('');
        setView('MEETING_HISTORY');
      } catch (error) {
          console.error("Erro ao salvar ata:", error);
          alert("Erro ao salvar Ata. Tente novamente.");
      } finally {
          setIsLoading(false);
      }
  }

  // --- User Mgmt Handlers ---
  const openEditModal = (user: User) => {
      setEditingUser({...user, password: ''}); 
      setOriginalMatriculaEdit(user.matricula);
      setShowUserEditModal(true);
  }

  const saveUserChanges = async () => {
      if(!editingUser) return;
      setIsLoading(true);
      try {
        await updateUser(editingUser, originalMatriculaEdit);
        setUsersList(await getAllUsers());
        setShowUserEditModal(false);
      } catch(e) {
          alert("Erro ao salvar.");
      } finally {
        setIsLoading(false);
      }
  }

  // --- Profile Handlers ---
  const handleSaveProfile = async () => {
      if (!profileData) return;
      if (!profileData.name || !profileData.email) return alert("Nome e Email obrigatórios.");
      
      setIsLoading(true);
      try {
          await updateUser(profileData, profileData.matricula);
          // Atualizar sessão se for o próprio usuário
          updateSessionUser(profileData);
          setCurrentUser(profileData);
          alert("Perfil atualizado!");
          setView('MENU');
      } catch (e) {
          alert("Erro ao atualizar perfil.");
      } finally {
          setIsLoading(false);
      }
  }

  // --- Role Handlers ---
  const handleAddRole = async () => {
      if (newRoleName && !availableRoles.includes(newRoleName)) {
          setIsLoading(true);
          try {
              const newRoles = [...availableRoles, newRoleName];
              setAvailableRoles(newRoles);
              await saveRoles(newRoles);
              setNewRoleName('');
          } catch(e) {
              alert("Erro ao salvar cargo.");
          } finally {
              setIsLoading(false);
          }
      }
  }

  const handleDeleteRole = async (roleToDelete: string) => {
      if(confirm(`Excluir cargo ${roleToDelete}?`)) {
          setIsLoading(true);
          try {
              const newRoles = availableRoles.filter(r => r !== roleToDelete);
              setAvailableRoles(newRoles);
              await saveRoles(newRoles);
          } catch(e) {
              alert("Erro ao excluir cargo.");
          } finally {
              setIsLoading(false);
          }
      }
  }

  // --- Permissions Handler Optimized ---
  const handleTogglePermission = (role: string, module: 'CHECKLIST' | 'MEETING' | 'MAINTENANCE' | 'AUDIT' | 'ADMIN') => {
      // 1. Calculate new state immediately for UI responsiveness
      const existing = permissions.find(p => p.role === role && p.module === module);
      const newVal = existing ? !existing.allowed : true;
      
      const newPerm: Permission = { role, module, allowed: newVal };
      const otherPerms = permissions.filter(p => !(p.role === role && p.module === module));
      const updatedList = [...otherPerms, newPerm];
      
      // 2. Update Local State
      setPermissions(updatedList);
      
      // 3. Save to server in background
      savePermissions(updatedList).catch(err => {
          console.error("Failed to save permission", err);
          // Optional: Revert state on error if needed
      });
  }

  // --- Editor Handlers (Generic) ---
  const handleEditorChange = (
      list: ChecklistItem[], 
      setList: React.Dispatch<React.SetStateAction<ChecklistItem[]>>,
      id: string, 
      field: keyof ChecklistItem, 
      value: string
    ) => {
      setList(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  }

  const handleEditorImage = async (
      list: ChecklistItem[], 
      setList: React.Dispatch<React.SetStateAction<ChecklistItem[]>>,
      id: string, 
      file: File
  ) => {
      try {
          const base64 = await fileToBase64(file);
          setList(prev => prev.map(i => i.id === id ? { ...i, imageUrl: base64 } : i));
      } catch(e) { alert("Erro na imagem"); }
  }

  const handleEditorRemoveImage = (
      list: ChecklistItem[], 
      setList: React.Dispatch<React.SetStateAction<ChecklistItem[]>>,
      id: string
  ) => {
      setList(prev => prev.map(i => i.id === id ? { ...i, imageUrl: '' } : i));
  }

  const handleEditorAdd = async (
      list: ChecklistItem[], 
      setList: React.Dispatch<React.SetStateAction<ChecklistItem[]>>,
      type: 'LEADER' | 'MAINTENANCE'
  ) => {
      // Use timestamp for unique ID to avoid SQL UNIQUE constraint errors
      const newId = Date.now().toString();

      const newItem: ChecklistItem = {
          id: newId,
          category: type === 'MAINTENANCE' ? 'NOME_DA_MAQUINA' : 'GERAL',
          text: 'Novo Item...',
          evidence: '',
          type: type
      };
      setList(prev => [...prev, newItem]);
  }

  const handleEditorDelete = (
      list: ChecklistItem[], 
      setList: React.Dispatch<React.SetStateAction<ChecklistItem[]>>,
      id: string
  ) => {
      if(confirm("Excluir item?")) {
          setList(prev => prev.filter(i => i.id !== id));
      }
  }

  const handleSaveEditor = async (
      targetList: ChecklistItem[],
      type: 'LEADER' | 'MAINTENANCE'
  ) => {
      if(confirm("Salvar alterações?")) {
          setIsLoading(true);
          try {
            // We need to merge with existing items of OTHER types because server overwrites all
            const allItems = await getAllChecklistItemsRaw();
            const otherItems = allItems.filter(i => (i.type || 'LEADER') !== type);
            const merged = [...otherItems, ...targetList];
            
            await saveChecklistItems(merged);
            
            alert("Salvo com sucesso!");
          } catch(e) {
              alert("Erro ao salvar.");
          } finally {
            setIsLoading(false);
          }
      }
  }

  const printQrCode = (text: string) => {
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
      const win = window.open('', '_blank');
      if(win) {
          win.document.write(`<html><head><title>QR Code - ${text}</title></head><body style="text-align:center; font-family:sans-serif;"><h1>${text}</h1><img src="${url}" style="width:300px;height:300px;"/><br/><br/><button onclick="window.print()">Imprimir</button></body></html>`);
          win.document.close();
      }
  }

  // --- Views ---

  // CRITICAL: Line Selection Prompt moved to top level return logic
  if (showLinePrompt) {
      return (<Layout><div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"><Card className="w-full max-w-sm"><h2 className="text-xl font-bold mb-4 text-center">Configuração Inicial</h2><p className="text-zinc-400 mb-4 text-sm text-center">Selecione a linha de produção:</p><select className="w-full p-3 bg-zinc-950 border border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-600 outline-none text-white mb-6" value={currentLine} onChange={(e) => setCurrentLine(e.target.value)}>{lines.map(l => <option key={l} value={l}>{l}</option>)}</select><div className="flex gap-2"><Button variant="secondary" fullWidth onClick={() => setShowLinePrompt(false)}>Cancelar</Button><Button fullWidth onClick={handleConfirmLine}>Iniciar</Button></div></Card></div></Layout>);
  }

  // Modal de Preview
  const renderPreviewModal = () => {
      if (!previewLog) return null;
      return (
          <div className="fixed inset-0 bg-black/90 z-[100] flex flex-col p-4 overflow-hidden">
              <div className="bg-zinc-900 w-full max-w-4xl mx-auto rounded-xl flex flex-col max-h-full border border-zinc-700 shadow-2xl">
                  <div className="p-4 border-b border-zinc-700 flex justify-between items-center bg-zinc-800 rounded-t-xl">
                      <div>
                          <h3 className="text-xl font-bold text-white">Visualização de Checklist {previewLog.type === 'MAINTENANCE' ? '(Manutenção)' : ''}</h3>
                          <p className="text-sm text-zinc-400">{new Date(previewLog.date).toLocaleString()} - {previewLog.userName} ({previewLog.line})</p>
                          {previewLog.maintenanceTarget && <p className="text-sm text-purple-400 font-bold">Máquina: {previewLog.maintenanceTarget}</p>}
                      </div>
                      <Button variant="secondary" onClick={() => setPreviewLog(null)}>Fechar</Button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                       {/* Se for Manutenção, carrega itens de manutenção, se não, items do lider */}
                       {(previewLog.type === 'MAINTENANCE' ? maintenanceItems : leaderItems).length === 0 && <p className="text-zinc-500 italic">Carregando itens de referência...</p>}
                       
                       {(previewLog.type === 'MAINTENANCE' ? maintenanceItems : leaderItems).map(item => {
                           // Se for manutenção, filtrar apenas itens da maquina alvo
                           if (previewLog.type === 'MAINTENANCE' && previewLog.maintenanceTarget && item.category.toLowerCase() !== previewLog.maintenanceTarget.toLowerCase()) return null;

                           const status = previewLog.data[item.id];
                           if (!status && previewLog.type === 'MAINTENANCE') return null;

                           const evidence = previewLog.evidenceData?.[item.id];
                           return (
                               <div key={item.id} className={`mb-3 p-3 rounded border ${status === 'NG' ? 'border-red-500/50 bg-red-900/10' : status === 'OK' ? 'border-green-500/50 bg-green-900/10' : status === 'N/A' ? 'border-yellow-500/50 bg-yellow-900/10' : 'border-zinc-800 bg-zinc-950'}`}>
                                   <div className="flex justify-between items-start">
                                       <div className="flex-1 mr-4">
                                           <span className="text-xs font-bold text-zinc-500 block mb-1">{item.category}</span>
                                           <p className="text-sm text-zinc-200">{item.text}</p>
                                           {evidence && (
                                                <div className="mt-2 p-2 bg-black/20 rounded border border-red-500/30">
                                                    <p className="text-red-300 text-xs font-bold">Evidência de Falha:</p>
                                                    <p className="text-zinc-300 text-xs italic">"{evidence.comment}"</p>
                                                    {evidence.photo && <img src={evidence.photo} className="mt-2 h-20 w-auto rounded border border-zinc-700"/>}
                                                </div>
                                           )}
                                       </div>
                                       <span className={`px-3 py-1 rounded text-xs font-bold ${status === 'NG' ? 'bg-red-600 text-white' : status === 'OK' ? 'bg-green-600 text-white' : status === 'N/A' ? 'bg-yellow-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>
                                           {status || '-'}
                                       </span>
                                   </div>
                               </div>
                           )
                       })}
                       {previewLog.observation && (
                           <div className="mt-4 p-4 bg-zinc-950 rounded border border-zinc-800">
                               <h4 className="text-sm font-bold text-zinc-400 mb-1">Observações:</h4>
                               <p className="text-zinc-200">{previewLog.observation}</p>
                           </div>
                       )}
                  </div>
              </div>
          </div>
      )
  }

  // --- LOGIN ---
  if (view === 'LOGIN') {
      return (
        <Layout>
          {isLoading && <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center text-white">Carregando...</div>}
          <div className="flex flex-col items-center justify-center min-h-[80vh]">
            <div className="mb-8 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-zinc-800 text-blue-500 mb-4 border border-zinc-700 shadow-xl">
                <img src="logo.png" className="w-12 h-12" alt="Logo" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
              </div>
              <h1 className="text-4xl font-black text-white tracking-tight">TECPLAM</h1>
              <p className="text-zinc-400 mt-2 text-sm uppercase tracking-widest">Controle Automático de Relatório</p>
            </div>
            <Card className="w-full max-w-md">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2"><LogIn className="text-blue-500" size={20} /> Acessar Sistema</h2>
              <form onSubmit={async (e) => { e.preventDefault(); setIsLoading(true); const r = await loginUser(loginMatricula, loginPassword); setIsLoading(false); if(r.success && r.user) { setCurrentUser(r.user); setView('MENU'); } else { setLoginError(r.message); } }} className="space-y-4">
                <Input label="Matrícula" placeholder="Ex: 1234" value={loginMatricula} onChange={(e) => setLoginMatricula(e.target.value)} autoComplete="off" />
                <Input label="Senha" type="password" placeholder="Ex: *****" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} autoComplete="off" />
                <div className="flex justify-end"><button type="button" onClick={() => setView('RECOVER')} className="text-xs text-blue-400 hover:text-blue-300">Esqueci minha senha</button></div>
                {loginError && (<div className="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-200 text-sm flex items-center gap-2"><AlertCircle size={16} /> {loginError}</div>)}
                <Button type="submit" fullWidth disabled={isLoading}>{isLoading ? 'Entrando...' : 'Entrar'}</Button>
              </form>
              <div className="mt-6 pt-6 border-t border-zinc-700 text-center"><Button variant="outline" fullWidth onClick={() => setView('REGISTER')}><UserPlus size={18} /> Criar Conta</Button></div>
              <div className="mt-8 text-center text-xs text-zinc-500 border-t border-zinc-700/50 pt-4 flex justify-between items-center"><div className="flex items-center gap-2"><Wifi size={12} className="text-green-500" /><span title={getServerUrl() || ''}>Conectado ao Servidor Local</span></div><button onClick={() => { clearServerUrl(); setView('SETUP'); }} className="text-zinc-600 hover:text-red-500 underline">Alterar IP</button></div>
            </Card>
          </div>
        </Layout>
      );
  }

  if (view === 'REGISTER') {
      return (
          <Layout>
              <div className="flex flex-col items-center justify-center min-h-[80vh]">
                  <Card className="w-full max-w-md">
                      <h2 className="text-xl font-semibold mb-6 flex items-center gap-2"><UserPlus className="text-blue-500" size={20} /> Criar Conta</h2>
                      <form onSubmit={handleRegister} className="space-y-4">
                          <Input label="Nome Completo" value={regName} onChange={e => setRegName(e.target.value)} />
                          <Input label="Matrícula" value={regMatricula} onChange={e => setRegMatricula(e.target.value)} />
                          <div>
                              <label className="text-sm text-zinc-400">Função</label>
                              <select className="w-full p-3 bg-zinc-950 border border-zinc-700 rounded-lg text-white" value={regRole} onChange={e => setRegRole(e.target.value)}>
                                  {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="text-sm text-zinc-400">Turno</label>
                              <select className="w-full p-3 bg-zinc-950 border border-zinc-700 rounded-lg text-white" value={regShift} onChange={e => setRegShift(e.target.value)}>
                                  <option value="1">1º Turno</option><option value="2">2º Turno</option>
                              </select>
                          </div>
                          <Input label="Email" type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
                          <Input label="Senha" type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} />
                          {regError && <div className="text-red-400 text-sm">{regError}</div>}
                          <Button type="submit" fullWidth disabled={isLoading}>{isLoading ? 'Salvando...' : 'Cadastrar'}</Button>
                          <Button type="button" variant="outline" fullWidth onClick={() => setView('LOGIN')}>Voltar</Button>
                      </form>
                  </Card>
              </div>
          </Layout>
      )
  }

  if (view === 'RECOVER') {
      return (
          <Layout>
              <div className="flex flex-col items-center justify-center min-h-[80vh]">
                  <Card className="w-full max-w-md">
                      <h2 className="text-xl font-bold mb-4">Recuperar Senha</h2>
                      <p className="text-sm text-zinc-400 mb-4">Entre em contato com o Admin ou digite seus dados abaixo se houver sistema de email configurado.</p>
                      <Button fullWidth onClick={() => setView('LOGIN')}>Voltar ao Login</Button>
                  </Card>
              </div>
          </Layout>
      )
  }

  if (view === 'SETUP') return <Layout><div className="flex flex-col items-center justify-center min-h-[80vh]"><Card className="w-full max-w-2xl"><h1 className="text-2xl font-bold text-center mb-4">Configuração de Rede</h1><Input label="IP do Servidor" value={serverIp} onChange={e => setServerIp(e.target.value)} placeholder="http://192.168.X.X:3000" /><Button onClick={async () => { if(serverIp){ saveServerUrl(serverIp); await initApp(); } }} fullWidth className="mt-4">Conectar</Button></Card></div></Layout>;
  
  // Dashboard view
  if (view === 'DASHBOARD') {
      return (
      <Layout>
        {isLoading && <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center text-white">Salvando...</div>}
        <header className="fixed top-0 left-0 right-0 bg-zinc-900 z-40 border-b border-zinc-800 shadow-md">
          <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => setView(isMaintenanceMode ? 'MAINTENANCE_QR' : 'CHECKLIST_MENU')} className="p-2 rounded-full"><ArrowLeft size={20} /></Button>
              <div><h1 className="text-lg font-bold text-white leading-tight">{isMaintenanceMode ? 'Manutenção' : 'Checklist Digital'}</h1><p className="text-xs text-zinc-400">{currentUser?.name} | Linha: {currentLine}</p></div>
            </div>
            <Button onClick={async () => { 
                if(!currentUser) return; 
                setIsLoading(true); 
                const log: ChecklistLog = { 
                    id: currentLogId || Date.now().toString(), 
                    userId: currentUser.matricula, 
                    userName: currentUser.name, 
                    userRole: currentUser.role, 
                    line: currentLine, 
                    date: getManausDate().toISOString(), 
                    itemsCount: items.length, 
                    ngCount: Object.values(checklistData).filter(v=>v==='NG').length, 
                    observation, 
                    data: checklistData,
                    evidenceData: checklistEvidence,
                    type: isMaintenanceMode ? 'MAINTENANCE' : 'PRODUCTION',
                    maintenanceTarget: maintenanceTarget
                }; 
                await saveLog(log); 
                setIsLoading(false); 
                setView('SUCCESS'); 
            }} className="shadow-lg shadow-blue-900/20"><Save size={18} /> <span className="hidden md:inline">Finalizar</span></Button>
          </div>
        </header>
        <div className="h-20"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="hidden md:block md:col-span-1"><div className="sticky top-24 space-y-1 max-h-[80vh] overflow-y-auto custom-scrollbar pr-2"><p className="text-xs font-bold text-zinc-500 uppercase px-2 mb-2">Postos</p>{categories.map(cat => (<button key={cat} onClick={() => categoryRefs.current[cat]?.scrollIntoView({behavior:'smooth'})} className="w-full text-left px-3 py-2 rounded text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors truncate">{cat}</button>))}</div></div>
          <div className="md:col-span-3 space-y-8 pb-10">
            {categories.map(cat => (
              <div key={cat} ref={el => { categoryRefs.current[cat] = el; }} className="scroll-mt-24"><h2 className="text-xl font-bold text-white mb-4 pl-1 border-l-4 border-blue-500">{cat}</h2>
                <div className="space-y-4">{items.filter(i => i.category === cat).map(item => { const currentStatus = checklistData[item.id]; return (
                    <div key={item.id} className={`bg-zinc-800 rounded-xl p-4 border transition-all ${currentStatus === 'OK' ? 'border-green-500/50 bg-green-900/10' : currentStatus === 'NG' ? 'border-red-500/50 bg-red-900/10' : currentStatus === 'N/A' ? 'border-yellow-500/50 bg-yellow-900/10' : 'border-zinc-700'}`}>
                        <div className="flex flex-col gap-4">
                            {item.imageUrl && (<div className="w-full h-48 bg-zinc-900 rounded-lg border border-zinc-700 overflow-hidden"><img src={item.imageUrl} alt="Ref" className="w-full h-full object-contain" /></div>)}
                            <div className="flex-1">
                                <p className="text-zinc-200 font-medium mb-1">{item.text}</p>
                                {item.evidence && (<p className="text-zinc-500 text-xs italic mb-3">Ref: {item.evidence}</p>)}
                                <div className="flex gap-2 mb-3">{['OK', 'NG', 'N/A'].map((t) => (<button key={t} onClick={() => setChecklistData({...checklistData, [item.id]: t as ResponseType})} className={`flex-1 py-2 rounded font-bold text-sm transition-all border ${t === currentStatus ? (t==='OK'?'bg-green-600 border-green-500 text-white': t==='NG'?'bg-red-600 border-red-500 text-white':'bg-yellow-600 border-yellow-500 text-white') : 'bg-zinc-900 text-zinc-500 border-zinc-700 hover:bg-zinc-700'}`}>{t}</button>))}</div>
                                
                                {/* NG EVIDENCE SECTION */}
                                {currentStatus === 'NG' && (
                                    <div className="bg-zinc-950/50 border border-red-900/30 rounded p-3 mt-2 animate-in fade-in slide-in-from-top-2">
                                        <p className="text-xs text-red-400 font-bold mb-2 flex items-center gap-1"><AlertTriangle size={12}/> Evidência Obrigatória</p>
                                        <Input placeholder="Descreva o motivo da falha..." value={checklistEvidence[item.id]?.comment || ''} onChange={e => handleNgComment(item.id, e.target.value)} />
                                        <div className="mt-2">
                                            {checklistEvidence[item.id]?.photo ? (
                                                <div className="relative inline-block">
                                                    <img src={checklistEvidence[item.id]?.photo} className="h-20 w-auto rounded border border-zinc-700" />
                                                    <button onClick={() => setChecklistEvidence(prev => { const n = {...prev}; delete n[item.id].photo; return n; })} className="absolute -top-2 -right-2 bg-red-600 rounded-full p-1"><X size={12}/></button>
                                                </div>
                                            ) : (
                                                <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 px-3 py-2 rounded inline-flex items-center gap-2 border border-zinc-700">
                                                    <Camera size={14} /> Adicionar Foto
                                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { if(e.target.files?.[0]) handleNgPhoto(item.id, e.target.files[0]) }} />
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>); })}</div>
              </div>
            ))}
            <Card><label className="block text-sm font-medium text-zinc-400 mb-2">Observações Gerais</label><textarea className="w-full p-3 bg-zinc-950 border border-zinc-700 rounded-lg text-white h-24 resize-none focus:ring-2 focus:ring-blue-600 outline-none" placeholder="Anotações..." value={observation} onChange={e => setObservation(e.target.value)} /></Card>
          </div>
        </div>
      </Layout>
    );
  }

  // Success Screen
  if (view === 'SUCCESS') return <Layout><div className="flex flex-col items-center justify-center min-h-[80vh] text-center"><div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6"><CheckCircle2 size={40} /></div><h2 className="text-3xl font-bold text-white mb-2">Checklist Salvo!</h2><p className="text-zinc-400 mb-8 max-w-md">Dados registrados.</p><Button onClick={() => setView('MENU')} className="min-w-[200px]">Voltar</Button></div></Layout>;

  // Personal Logs
  if (view === 'PERSONAL') {
      return (
          <Layout>
              <header className="flex items-center justify-between mb-6">
                  <h1 className="text-2xl font-bold">Meus Registros</h1>
                  <Button variant="outline" onClick={() => setView('CHECKLIST_MENU')}>Voltar</Button>
              </header>
              <div className="space-y-4">
                  {personalLogs.length === 0 && <p className="text-zinc-500 text-center">Nenhum registro encontrado.</p>}
                  {personalLogs.map(log => (
                      <Card key={log.id} className="flex justify-between items-center">
                          <div>
                              <p className="font-bold">{new Date(log.date).toLocaleString()}</p>
                              <p className="text-sm text-zinc-400">{log.line} - {log.ngCount > 0 ? `${log.ngCount} NGs` : 'OK'}</p>
                          </div>
                          <div className="flex gap-2">
                              <Button onClick={() => setPreviewLog(log)} variant="secondary" className="px-3"><Eye size={16}/></Button>
                              <Button onClick={() => exportLogToExcel(log, items)} className="px-3"><Download size={16}/></Button>
                          </div>
                      </Card>
                  ))}
              </div>
              {renderPreviewModal()}
          </Layout>
      )
  }

  // Profile
  if (view === 'PROFILE' && profileData) {
      return (
          <Layout>
              <header className="flex items-center justify-between mb-6">
                  <h1 className="text-2xl font-bold">Meu Perfil</h1>
                  <Button variant="outline" onClick={() => setView('MENU')}>Voltar</Button>
              </header>
              <Card>
                  <div className="space-y-4 max-w-md mx-auto">
                      <div className="flex flex-col items-center mb-6">
                          <div className="w-20 h-20 bg-zinc-700 rounded-full flex items-center justify-center text-2xl font-bold mb-2">
                              {profileData.name.charAt(0)}
                          </div>
                          <p className="text-zinc-400">{profileData.role}</p>
                      </div>
                      <Input label="Nome" value={profileData.name} onChange={e => setProfileData({...profileData, name: e.target.value})} />
                      <Input label="Email" value={profileData.email} onChange={e => setProfileData({...profileData, email: e.target.value})} />
                      <Input label="Senha" type="password" placeholder="Nova senha (opcional)" value={profileData.password || ''} onChange={e => setProfileData({...profileData, password: e.target.value})} />
                      <Button fullWidth onClick={handleSaveProfile}>Salvar Alterações</Button>
                  </div>
              </Card>
          </Layout>
      )
  }

  // --- CHECKLIST SUB-MENU ---
  if (view === 'CHECKLIST_MENU') {
      return (
        <Layout>
            <header className="mb-6"><Button variant="outline" onClick={() => setView('MENU')}><ArrowLeft size={16} /> Voltar</Button></header>
            <h1 className="text-2xl font-bold mb-6 text-white border-l-4 border-blue-500 pl-4">Menu Checklist</h1>
            
            <div className="grid grid-cols-1 gap-4">
                 {hasPermission('CHECKLIST') && (
                     <div onClick={handleStartChecklist} className="bg-zinc-900 p-5 rounded-xl border border-zinc-700 hover:bg-zinc-800 cursor-pointer flex items-center gap-4 transition-colors">
                         <div className="p-3 bg-blue-600/20 text-blue-500 rounded-lg"><Plus size={24} /></div>
                         <div><h3 className="font-bold text-lg">CHECKLIST DO LÍDER</h3><p className="text-sm text-zinc-400">Iniciar checklist do turno atual</p></div>
                     </div>
                 )}

                 <div onClick={handleOpenPersonalHistory} className="bg-zinc-900 p-5 rounded-xl border border-zinc-700 hover:bg-zinc-800 cursor-pointer flex items-center gap-4 transition-colors">
                     <div className="p-3 bg-purple-600/20 text-purple-500 rounded-lg"><History size={24} /></div>
                     <div><h3 className="font-bold text-lg">Meus Registros</h3><p className="text-sm text-zinc-400">Ver histórico dos meus envios</p></div>
                 </div>
                 
                 {hasPermission('MAINTENANCE') && (
                     <div onClick={() => setView('MAINTENANCE_QR')} className="bg-zinc-900 p-5 rounded-xl border border-zinc-700 hover:bg-zinc-800 cursor-pointer flex items-center gap-4 transition-colors">
                         <div className="p-3 bg-purple-600/20 text-purple-500 rounded-lg"><Hammer size={24} /></div>
                         <div><h3 className="font-bold text-lg">Manutenção</h3><p className="text-sm text-zinc-400">Ler QR Code para Checklist de Máquinas/Estações.</p></div>
                     </div>
                 )}
            </div>
        </Layout>
      );
  }

  // --- MEETING MENU ---
  if (view === 'MEETING_MENU') {
      return (
        <Layout>
            <header className="mb-6"><Button variant="outline" onClick={() => setView('MENU')}><ArrowLeft size={16} /> Voltar</Button></header>
            <h1 className="text-2xl font-bold mb-6 text-white border-l-4 border-green-500 pl-4">Ata de Reunião</h1>
            <div className="grid grid-cols-1 gap-4">
                 <div onClick={() => setView('MEETING_FORM')} className="bg-zinc-900 p-5 rounded-xl border border-zinc-700 hover:bg-zinc-800 cursor-pointer flex items-center gap-4 transition-colors">
                     <div className="p-3 bg-green-600/20 text-green-500 rounded-lg"><Plus size={24} /></div>
                     <div><h3 className="font-bold text-lg">Nova Ata</h3><p className="text-sm text-zinc-400">Registrar reunião online</p></div>
                 </div>
                 <div onClick={() => setView('MEETING_HISTORY')} className="bg-zinc-900 p-5 rounded-xl border border-zinc-700 hover:bg-zinc-800 cursor-pointer flex items-center gap-4 transition-colors">
                     <div className="p-3 bg-blue-600/20 text-blue-500 rounded-lg"><History size={24} /></div>
                     <div><h3 className="font-bold text-lg">Histórico de Atas</h3><p className="text-sm text-zinc-400">Ver e imprimir atas anteriores</p></div>
                 </div>
            </div>
        </Layout>
      )
  }

  // --- MEETING FORM ---
  if (view === 'MEETING_FORM') {
      return (
        <Layout>
             <header className="flex items-center justify-between mb-6 pb-6 border-b border-zinc-800">
                <h1 className="text-2xl font-bold text-zinc-100">Nova Ata de Reunião</h1>
                <Button variant="outline" onClick={() => setView('MEETING_MENU')}><ArrowLeft size={16} /> Cancelar</Button>
            </header>
            <div className="space-y-6">
                <Card>
                    <h3 className="font-bold mb-4 flex items-center gap-2"><FileText size={18}/> Título da Reunião</h3>
                    <Input placeholder="Ex: Alinhamento de Turno, Qualidade, etc." value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} />
                </Card>

                <Card>
                    <h3 className="font-bold mb-4 flex items-center gap-2"><Camera size={18}/> Foto da Reunião (Obrigatório)</h3>
                    {meetingPhoto ? (
                        <div className="relative">
                            <img src={meetingPhoto} alt="Reunião" className="w-full h-64 object-cover rounded-lg border border-zinc-700" />
                            <Button variant="danger" className="absolute top-2 right-2" onClick={() => setMeetingPhoto('')}><Trash2 size={16}/></Button>
                        </div>
                    ) : (
                        <div className="h-64 bg-zinc-950 border-2 border-dashed border-zinc-700 rounded-lg flex flex-col items-center justify-center text-zinc-500">
                            <label className="cursor-pointer flex flex-col items-center">
                                <Camera size={40} className="mb-2" />
                                <span>Tirar Foto / Upload</span>
                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if(e.target.files?.[0]) handleMeetingPhoto(e.target.files[0]) }} />
                            </label>
                        </div>
                    )}
                </Card>

                <Card>
                    <h3 className="font-bold mb-4 flex items-center gap-2"><Users size={18}/> Participantes</h3>
                    <div className="flex gap-2 mb-4">
                        <Input placeholder="Nome do participante" value={newParticipant} onChange={e => setNewParticipant(e.target.value)} />
                        <Button onClick={handleAddParticipant}><Plus size={18}/></Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {meetingParticipants.map((p, idx) => (
                            <div key={idx} className="bg-zinc-700 text-white px-3 py-1 rounded-full flex items-center gap-2 text-sm">
                                {p}
                                <button onClick={() => handleRemoveParticipant(idx)} className="hover:text-red-400"><X size={14}/></button>
                            </div>
                        ))}
                    </div>
                </Card>

                <Card>
                     <h3 className="font-bold mb-4 flex items-center gap-2"><FileText size={18}/> Assuntos Tratados</h3>
                     <textarea className="w-full p-4 bg-zinc-950 border border-zinc-700 rounded-lg text-white h-40 focus:ring-2 focus:ring-blue-600 outline-none" placeholder="Descreva os tópicos discutidos..." value={meetingTopics} onChange={e => setMeetingTopics(e.target.value)} />
                </Card>
                
                <Button fullWidth onClick={handleSaveMeeting} disabled={isLoading}>{isLoading ? 'Salvando...' : 'Salvar Ata'}</Button>
            </div>
        </Layout>
      )
  }

  // --- MEETING HISTORY ---
  if (view === 'MEETING_HISTORY') {
      return (
          <Layout>
            <header className="flex items-center justify-between mb-6 pb-6 border-b border-zinc-800">
                <h1 className="text-2xl font-bold text-zinc-100">Histórico de Atas</h1>
                <Button variant="outline" onClick={() => setView('MEETING_MENU')}><ArrowLeft size={16} /> Voltar</Button>
            </header>
            <div className="space-y-4">
                {meetingHistory.map(m => (
                    <Card key={m.id} className="flex justify-between items-center">
                        <div>
                            <p className="font-bold text-white text-lg">{m.title || 'Sem Título'}</p>
                            <p className="font-medium text-zinc-300">{new Date(m.date).toLocaleDateString()} - {m.startTime}</p>
                            <p className="text-sm text-zinc-400">Criado por: {m.createdBy}</p>
                            <p className="text-xs text-zinc-500 mt-1">{m.participants.length} participantes</p>
                        </div>
                        <Button onClick={() => exportMeetingToExcel(m)}><Download size={16}/> Excel</Button>
                    </Card>
                ))}
            </div>
          </Layout>
      )
  }

  // --- QR CODE SCANNER VIEW ---
  if (view === 'MAINTENANCE_QR') {
      return (
          <Layout>
               <header className="flex items-center justify-between mb-6 pb-6 border-b border-zinc-800">
                    <h1 className="text-2xl font-bold text-zinc-100">Ler QR Code Máquina</h1>
                    <Button variant="outline" onClick={() => setView('CHECKLIST_MENU')}><ArrowLeft size={16} /> Voltar</Button>
               </header>
               <Card className="text-center">
                   <div id="reader" className="w-full max-w-sm mx-auto mb-4 bg-zinc-900 rounded overflow-hidden"></div>
                   <p className="text-sm text-zinc-400 mb-6">Aponte a câmera para o QR Code da estação.</p>
                   
                   <div className="border-t border-zinc-700 pt-6 mt-6">
                       <p className="text-xs text-zinc-500 mb-2">Problemas com a câmera? Digite o código:</p>
                       <div className="flex gap-2">
                           <Input placeholder="Código (Ex: PRENSA_01)" value={qrCodeManual} onChange={e => setQrCodeManual(e.target.value)} />
                           <Button onClick={() => handleMaintenanceCode(qrCodeManual)}>Ir</Button>
                       </div>
                   </div>
               </Card>
          </Layout>
      )
  }

  // --- AUDIT MENU ---
  if (view === 'AUDIT_MENU') {
      return (
        <Layout>
            {renderPreviewModal()}
            <header className="flex flex-col gap-4 mb-6 pb-6 border-b border-zinc-800">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2"><Search className="text-yellow-500" /> Auditoria</h1>
                    <Button variant="outline" onClick={() => setView('MENU')}><ArrowLeft size={16} /> Voltar</Button>
                </div>
                {/* ALERTA DE LÍDERES PENDENTES */}
                {missingLeadersNames.length > 0 && (
                    <div className="bg-yellow-900/30 border border-yellow-700 p-3 rounded-lg flex items-start gap-3 animate-pulse">
                        <AlertCircle className="text-yellow-500 mt-1" size={24} />
                        <div>
                            <p className="text-yellow-200 font-bold">Atenção!</p>
                            <p className="text-yellow-400 text-sm">
                                {missingLeadersNames.length} Líder(es) pendentes: <br/>
                                <span className="font-semibold">{missingLeadersNames.join(', ')}</span>
                            </p>
                        </div>
                    </div>
                )}
            </header>

            <div className="mb-4">
                <h3 className="text-zinc-500 text-xs font-bold uppercase mb-2">Checklist Líder</h3>
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-thin">
                    <Button variant={auditTab === 'LEADER_HISTORY' ? 'primary' : 'secondary'} onClick={() => setAuditTab('LEADER_HISTORY')}><History size={16} /> Histórico</Button>
                    <Button variant={auditTab === 'LEADERS' ? 'primary' : 'secondary'} onClick={() => setAuditTab('LEADERS')}><UserCheck size={16} /> Líderes</Button>
                    <Button variant={auditTab === 'LINES' ? 'primary' : 'secondary'} onClick={() => setAuditTab('LINES')}><List size={16} /> Linhas</Button>
                    <Button variant={auditTab === 'LEADER_EDITOR' ? 'primary' : 'secondary'} onClick={() => setAuditTab('LEADER_EDITOR')}><Edit3 size={16} /> Editar Perguntas</Button>
                </div>

                <h3 className="text-zinc-500 text-xs font-bold uppercase mb-2">Checklist Manutenção</h3>
                <div className="flex gap-2 mb-2 overflow-x-auto pb-2 scrollbar-thin">
                    <Button variant={auditTab === 'MAINTENANCE_HISTORY' ? 'primary' : 'secondary'} onClick={() => setAuditTab('MAINTENANCE_HISTORY')}><History size={16} /> Relatórios</Button>
                    <Button variant={auditTab === 'MAINTENANCE_EDITOR' ? 'primary' : 'secondary'} onClick={() => setAuditTab('MAINTENANCE_EDITOR')}><Edit3 size={16} /> Criar Postos/QR Code</Button>
                </div>
            </div>

            {auditTab === 'LEADER_HISTORY' && (
                <Card>
                    <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold">Histórico de Produção (Líderes)</h3><div className="flex items-center gap-2 relative"><Calendar size={16} className="text-zinc-400 pointer-events-none absolute left-2"/><input type="date" onClick={showPicker} className="bg-zinc-950 border border-zinc-700 rounded p-1 pl-7 text-sm text-white cursor-pointer" value={historyDateFilter} onChange={e => setHistoryDateFilter(e.target.value)}/></div></div>
                    <div className="overflow-x-auto"><table className="w-full text-sm text-left text-zinc-300"><thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Líder</th><th className="px-4 py-3">Linha</th><th className="px-4 py-3 text-center">NGs</th><th className="px-4 py-3">Observação</th><th className="px-4 py-3 text-right">Ação</th></tr></thead><tbody>{historyLogs.map(log => (<tr key={log.id} className="border-b border-zinc-700 hover:bg-zinc-700/50 cursor-pointer"><td className="px-4 py-3">{new Date(log.date).toLocaleString()}</td><td className="px-4 py-3 text-white">{log.userName}</td><td className="px-4 py-3">{log.line || '-'}</td><td className="px-4 py-3 text-center">{log.ngCount > 0 ? <span className="bg-red-900/40 text-red-300 px-2 py-1 rounded font-bold">{log.ngCount}</span> : <span className="text-green-500">0</span>}</td><td className="px-4 py-3 truncate max-w-[150px]">{log.observation}</td><td className="px-4 py-3 text-right flex justify-end gap-2"><button onClick={() => setPreviewLog(log)} className="p-1.5 bg-blue-900/30 text-blue-400 rounded hover:bg-blue-900/50" title="Visualizar"><Eye size={16}/></button><button className="p-1.5 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700" onClick={(e) => {e.stopPropagation(); exportLogToExcel(log, items)}} title="Baixar Excel"><Download size={16}/></button></td></tr>))}</tbody></table></div>
                </Card>
            )}

            {auditTab === 'MAINTENANCE_HISTORY' && (
                <Card>
                    <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-semibold text-purple-400">Relatórios de Manutenção</h3><div className="flex items-center gap-2 relative"><Calendar size={16} className="text-zinc-400 pointer-events-none absolute left-2"/><input type="date" onClick={showPicker} className="bg-zinc-950 border border-zinc-700 rounded p-1 pl-7 text-sm text-white cursor-pointer" value={historyDateFilter} onChange={e => setHistoryDateFilter(e.target.value)}/></div></div>
                    {historyLogs.length === 0 ? <p className="text-zinc-500 text-center py-4">Nenhum registro de manutenção encontrado.</p> : (
                        <div className="overflow-x-auto"><table className="w-full text-sm text-left text-zinc-300"><thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Técnico/User</th><th className="px-4 py-3">Máquina/Alvo</th><th className="px-4 py-3 text-center">NGs</th><th className="px-4 py-3">Observação</th><th className="px-4 py-3 text-right">Ação</th></tr></thead><tbody>{historyLogs.map(log => (<tr key={log.id} className="border-b border-zinc-700 hover:bg-zinc-700/50 cursor-pointer"><td className="px-4 py-3">{new Date(log.date).toLocaleString()}</td><td className="px-4 py-3 text-white">{log.userName}</td><td className="px-4 py-3 font-bold text-purple-300">{log.maintenanceTarget || log.line}</td><td className="px-4 py-3 text-center">{log.ngCount > 0 ? <span className="bg-red-900/40 text-red-300 px-2 py-1 rounded font-bold">{log.ngCount}</span> : <span className="text-green-500">0</span>}</td><td className="px-4 py-3 truncate max-w-[150px]">{log.observation}</td><td className="px-4 py-3 text-right flex justify-end gap-2"><button onClick={() => setPreviewLog(log)} className="p-1.5 bg-blue-900/30 text-blue-400 rounded hover:bg-blue-900/50" title="Visualizar"><Eye size={16}/></button><button className="p-1.5 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700" onClick={(e) => {e.stopPropagation(); exportLogToExcel(log, items)}} title="Baixar Excel"><Download size={16}/></button></td></tr>))}</tbody></table></div>
                    )}
                </Card>
            )}

            {auditTab === 'LEADERS' && (
                <Card>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <h3 className="text-lg font-semibold">Monitoramento Diário de Líderes</h3>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2 bg-zinc-900 p-1.5 rounded border border-zinc-700"><span className="text-xs text-zinc-400 px-1">Semana:</span><input type="week" onClick={showPicker} className="bg-zinc-800 border-none rounded p-1 text-sm text-white focus:ring-0 outline-none cursor-pointer" value={linesWeekFilter} onChange={e => setLinesWeekFilter(e.target.value)} /></div>
                            <div className="flex items-center gap-2 bg-zinc-900 p-1.5 rounded border border-zinc-700"><span className="text-xs text-zinc-400 px-1">Turno:</span><select className="bg-zinc-800 border-none rounded p-1 text-sm text-white focus:ring-0 outline-none" value={linesShiftFilter} onChange={e => setLinesShiftFilter(e.target.value)}><option value="1">1º Turno</option><option value="2">2º Turno</option><option value="ALL">Todos</option></select></div>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-center border-collapse">
                            <thead><tr className="text-zinc-400 border-b border-zinc-700"><th className="p-2 text-left w-48">Líder</th><th className="p-2">Seg</th><th className="p-2">Ter</th><th className="p-2">Qua</th><th className="p-2">Qui</th><th className="p-2">Sex</th><th className="p-2">Sab</th></tr></thead>
                            <tbody>
                                {leadersMatrix.map((row, idx) => (
                                    <tr key={idx} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                                        <td className="p-3 text-left">
                                            <div className="font-medium text-white">{row.user.name}</div>
                                            <div className="text-xs text-zinc-500">{row.user.role}</div>
                                        </td>
                                        {row.statuses.map((st, i) => (
                                            <td key={i} className="p-2">
                                                <div 
                                                    onClick={() => { if(st.logId) handleOpenPreview(st.logId); }}
                                                    className={`w-full h-8 rounded flex items-center justify-center font-bold text-xs shadow-sm transition-all ${st.status === 'OK' ? 'bg-green-600 text-white cursor-pointer hover:bg-green-500' : st.status === 'NG' ? 'bg-red-900/30 text-red-500 border border-red-800' : 'bg-yellow-900/20 text-yellow-500 border border-yellow-800'}`}
                                                >
                                                    {st.status === 'PENDING' ? 'N/A' : st.status}
                                                </div>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {auditTab === 'LINES' && (
                <Card>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <h3 className="text-lg font-semibold">Visão Semanal por Linha</h3>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2 bg-zinc-900 p-1.5 rounded border border-zinc-700"><span className="text-xs text-zinc-400 px-1">Semana:</span><input type="week" onClick={showPicker} className="bg-zinc-800 border-none rounded p-1 text-sm text-white focus:ring-0 outline-none cursor-pointer" value={linesWeekFilter} onChange={e => setLinesWeekFilter(e.target.value)} /></div>
                            <div className="flex items-center gap-2 bg-zinc-900 p-1.5 rounded border border-zinc-700"><span className="text-xs text-zinc-400 px-1">Turno:</span><select className="bg-zinc-800 border-none rounded p-1 text-sm text-white focus:ring-0 outline-none" value={linesShiftFilter} onChange={e => setLinesShiftFilter(e.target.value)}><option value="1">1º Turno</option><option value="2">2º Turno</option><option value="ALL">Todos</option></select></div>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-center border-collapse">
                            <thead><tr className="text-zinc-400 border-b border-zinc-700"><th className="p-2 text-left w-32">Linha</th><th className="p-2">Seg</th><th className="p-2">Ter</th><th className="p-2">Qua</th><th className="p-2">Qui</th><th className="p-2">Sex</th><th className="p-2">Sab</th><th className="p-2 w-10"></th></tr></thead>
                            <tbody>
                                {linesMatrix.map((row, idx) => (
                                    <tr key={idx} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                                        <td className="p-3 text-left font-medium text-white bg-zinc-900/20">{row.line}</td>
                                        {row.statuses.map((st, i) => (
                                            <td key={i} className="p-2 align-top" onClick={() => { if(st.logIds.length > 0) handleOpenPreview(st.logIds[0]); }}>
                                                <div className={`w-full h-8 rounded flex items-center justify-center font-bold text-xs shadow-sm cursor-pointer hover:opacity-80 transition-opacity ${st.status === 'OK' ? 'bg-green-900/30 text-green-400 border border-green-800' : st.status === 'NG' ? 'bg-red-900/30 text-red-400 border border-red-800' : 'bg-zinc-800 text-zinc-600 border border-zinc-700'}`}>
                                                    {st.status === 'PENDING' ? '-' : st.status}
                                                </div>
                                                {st.leaderName && <div className="text-[10px] text-zinc-500 mt-1 truncate max-w-[80px] mx-auto">{st.leaderName}</div>}
                                            </td>
                                        ))}
                                        <td className="p-2">
                                            {linesShiftFilter !== 'ALL' && (
                                                <button onClick={() => handleDownloadSheet(row.line)} title="Baixar Planilha" className="text-blue-500 hover:text-blue-400 bg-blue-900/20 p-2 rounded hover:bg-blue-900/40 transition-colors"><Download size={16} /></button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* EDITOR DE LÍDER */}
            {auditTab === 'LEADER_EDITOR' && (
                <Card>
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold">Editor de Checklist (Líder)</h3>
                            <p className="text-xs text-zinc-400">Edite as perguntas do checklist padrão de liderança.</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => handleEditorAdd(leaderItems, setLeaderItems, 'LEADER')}><Plus size={16} /> Adicionar Item</Button>
                            <Button onClick={() => handleSaveEditor(leaderItems, 'LEADER')}><Save size={16} /> Salvar Alterações</Button>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {leaderItems.map((item) => (
                            <div key={item.id} className="bg-zinc-950 p-4 rounded border border-zinc-800 relative">
                                <div className="flex justify-between items-center mb-2">
                                     <Input className="w-1/3 text-xs p-1" value={item.category} onChange={e => handleEditorChange(leaderItems, setLeaderItems, item.id, 'category', e.target.value)} placeholder="Categoria (Posto)" />
                                     <div className="flex items-center gap-2">
                                         <span className="text-xs text-zinc-600">ID: {item.id}</span>
                                         <button onClick={() => handleEditorDelete(leaderItems, setLeaderItems, item.id)} className="text-zinc-500 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                                     </div>
                                </div>
                                <textarea 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-zinc-200 mb-3 focus:border-blue-500 outline-none" 
                                    rows={2}
                                    value={item.text}
                                    onChange={(e) => handleEditorChange(leaderItems, setLeaderItems, item.id, 'text', e.target.value)}
                                    placeholder="Texto da pergunta..."
                                />
                                <div className="flex items-center gap-4">
                                    {item.imageUrl ? (
                                        <div className="relative group">
                                            <img src={item.imageUrl} alt="Ref" className="w-16 h-16 object-cover rounded border border-zinc-700" />
                                            <button onClick={() => handleEditorRemoveImage(leaderItems, setLeaderItems, item.id)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-md hover:bg-red-700"><Trash2 size={12}/></button>
                                        </div>
                                    ) : (
                                        <div className="w-16 h-16 bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center text-zinc-600">
                                            <ImageIcon size={20} />
                                        </div>
                                    )}
                                    <div>
                                        <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 px-3 py-2 rounded flex items-center gap-2">
                                            <Upload size={14} /> Carregar Imagem
                                            <input type="file" accept="image/*" className="hidden" onChange={(e) => { if(e.target.files?.[0]) handleEditorImage(leaderItems, setLeaderItems, item.id, e.target.files[0]) }} />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* EDITOR DE MANUTENÇÃO */}
            {auditTab === 'MAINTENANCE_EDITOR' && (
                <Card>
                     <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-bold">Postos de Manutenção & QR Code</h3>
                            <p className="text-xs text-zinc-400">Crie itens para manutenção. A <strong>Categoria</strong> será o nome da Máquina/Estação para o QR Code.</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => handleEditorAdd(maintenanceItems, setMaintenanceItems, 'MAINTENANCE')}><Plus size={16} /> Adicionar Máquina/Item</Button>
                            <Button onClick={() => handleSaveEditor(maintenanceItems, 'MAINTENANCE')}><Save size={16} /> Salvar Alterações</Button>
                        </div>
                    </div>
                    <div className="space-y-4">
                        {maintenanceItems.map((item) => (
                            <div key={item.id} className="bg-zinc-950 p-4 rounded border border-zinc-800 relative">
                                <div className="flex justify-between items-center mb-2 gap-4">
                                     <div className="flex-1 flex gap-2">
                                         <Input className="flex-1 text-xs p-1" value={item.category} onChange={e => handleEditorChange(maintenanceItems, setMaintenanceItems, item.id, 'category', e.target.value)} placeholder="NOME DA MÁQUINA (Ex: PRENSA_01)" />
                                         <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => printQrCode(item.category)} title="Gerar QR Code desta Máquina"><QrCode size={16}/></Button>
                                     </div>
                                     <div className="flex items-center gap-2">
                                         <span className="text-xs text-zinc-600">ID: {item.id}</span>
                                         <button onClick={() => handleEditorDelete(maintenanceItems, setMaintenanceItems, item.id)} className="text-zinc-500 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                                     </div>
                                </div>
                                <textarea 
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-zinc-200 mb-3 focus:border-blue-500 outline-none" 
                                    rows={2}
                                    value={item.text}
                                    onChange={(e) => handleEditorChange(maintenanceItems, setMaintenanceItems, item.id, 'text', e.target.value)}
                                    placeholder="Item de verificação desta máquina..."
                                />
                            </div>
                        ))}
                        {maintenanceItems.length === 0 && <p className="text-zinc-500 text-center py-8">Nenhum posto de manutenção cadastrado.</p>}
                    </div>
                </Card>
            )}

        </Layout>
      );
  }

  // --- ADMIN VIEW (Users, Roles, Config, Permissions) ---
  if (view === 'ADMIN') {
    return (
      <Layout>
        {isLoading && <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center text-white">Carregando dados...</div>}
        
        {/* User Edit Modal */}
        {showUserEditModal && editingUser && (
            <div className="fixed inset-0 bg-black/80 z-[70] flex items-center justify-center p-4">
                <Card className="w-full max-w-md">
                    <h3 className="text-lg font-bold mb-4">Editar Usuário</h3>
                    <div className="space-y-3">
                        <Input label="Nome" value={editingUser.name} onChange={e => setEditingUser({...editingUser, name: e.target.value})} />
                        <Input label="Matrícula" value={editingUser.matricula} onChange={e => setEditingUser({...editingUser, matricula: e.target.value})} />
                        <div>
                             <label className="text-sm text-zinc-400">Função</label>
                             <select className="w-full p-2 bg-zinc-950 border border-zinc-700 rounded text-white" value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value})}>
                                 {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                             </select>
                        </div>
                        <div>
                             <label className="text-sm text-zinc-400">Turno</label>
                             <select className="w-full p-2 bg-zinc-950 border border-zinc-700 rounded text-white" value={editingUser.shift} onChange={e => setEditingUser({...editingUser, shift: e.target.value})}>
                                 <option value="1">1</option>
                                 <option value="2">2</option>
                             </select>
                        </div>
                        <Input label="Senha (Deixe em branco para manter)" placeholder="******" value={editingUser.password} onChange={e => setEditingUser({...editingUser, password: e.target.value})} />
                        
                        {/* Apenas SuperAdmin (admin) pode alterar permissão de admin */}
                        {isSuperAdmin && (
                            <div className="flex items-center gap-2 pt-2 pb-2">
                                <input type="checkbox" id="isAdminCheck" checked={editingUser.isAdmin || false} onChange={e => setEditingUser({...editingUser, isAdmin: e.target.checked})} className="w-5 h-5 accent-blue-600" />
                                <label htmlFor="isAdminCheck" className="text-white cursor-pointer select-none">Acesso de Administrador</label>
                            </div>
                        )}
                        {!isSuperAdmin && editingUser.isAdmin && <p className="text-xs text-blue-400">Este usuário é Administrador.</p>}
                    </div>
                    <div className="flex gap-2 mt-6">
                        <Button variant="secondary" fullWidth onClick={() => setShowUserEditModal(false)}>Cancelar</Button>
                        <Button fullWidth onClick={saveUserChanges}>Salvar</Button>
                    </div>
                </Card>
            </div>
        )}

        <header className="flex items-center justify-between mb-6 pb-6 border-b border-zinc-800">
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2"><Settings className="text-orange-500" /> Configuração do Sistema</h1>
          <Button variant="outline" onClick={() => setView('MENU')}><ArrowLeft size={16} /> Voltar</Button>
        </header>
        
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-thin">
          <Button variant={adminTab === 'USERS' ? 'primary' : 'secondary'} onClick={() => setAdminTab('USERS')}><Users size={16} /> Usuários</Button>
          <Button variant={adminTab === 'ROLES' ? 'primary' : 'secondary'} onClick={() => setAdminTab('ROLES')}><Settings size={16} /> Cargos</Button>
          <Button variant={adminTab === 'LINES' ? 'primary' : 'secondary'} onClick={() => setAdminTab('LINES')}><List size={16} /> Linhas</Button>
          <Button variant={adminTab === 'PERMISSIONS' ? 'primary' : 'secondary'} onClick={() => setAdminTab('PERMISSIONS')}><Shield size={16} /> Autorizações</Button>
        </div>

        {adminTab === 'LINES' && (
             <Card>
                <div className="mt-2">
                    <h4 className="text-sm font-bold mb-2">Adicionar / Remover Linhas</h4>
                    <div className="flex gap-2 mb-2"><Input placeholder="Nova Linha" value={newLineName} onChange={(e) => setNewLineName(e.target.value)} /><Button onClick={async () => { if(newLineName && !lines.includes(newLineName)) { const u=[...lines, newLineName]; setLines(u); await saveLines(u); setNewLineName(''); } }}><Plus size={18} /> Add</Button></div>
                    <div className="flex flex-wrap gap-2">{lines.map(line => (<div key={line} className="flex items-center gap-2 px-3 py-1 bg-zinc-900/50 rounded border border-zinc-700 text-xs text-zinc-300">{line}<button onClick={async () => { if(confirm('Excluir?')){ const u=lines.filter(l=>l!==line); setLines(u); await saveLines(u); }}} className="hover:text-red-500"><Trash2 size={12} /></button></div>))}</div>
                </div>
             </Card>
        )}

        {adminTab === 'ROLES' && (
             <Card>
                <h3 className="text-lg font-semibold mb-4">Gerenciar Cargos / Funções</h3>
                <div className="flex gap-2 mb-4">
                    <Input placeholder="Novo Cargo" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
                    <Button onClick={handleAddRole}><Plus size={18} /> Adicionar</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {availableRoles.map(role => (
                        <div key={role} className="flex justify-between items-center p-3 bg-zinc-900/50 rounded border border-zinc-700">
                            <span className="text-zinc-300">{role}</span>
                            <button onClick={() => handleDeleteRole(role)} className="text-zinc-500 hover:text-red-500 p-2"><Trash2 size={16} /></button>
                        </div>
                    ))}
                </div>
             </Card>
        )}
        
        {adminTab === 'PERMISSIONS' && (
             <Card>
                <h3 className="text-lg font-semibold mb-4">Autorizações de Acesso</h3>
                <p className="text-xs text-zinc-500 mb-4">Defina quais cargos podem acessar quais módulos do aplicativo.</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-zinc-300">
                        <thead>
                            <tr className="bg-zinc-900/50 text-zinc-400 border-b border-zinc-700">
                                <th className="p-3">Cargo</th>
                                <th className="p-3 text-center">Checklist</th>
                                <th className="p-3 text-center">Ata/Reunião</th>
                                <th className="p-3 text-center">Manutenção</th>
                                <th className="p-3 text-center">Auditoria</th>
                                <th className="p-3 text-center">Admin</th>
                            </tr>
                        </thead>
                        <tbody>
                            {availableRoles.map(role => (
                                <tr key={role} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                                    <td className="p-3 font-medium">{role}</td>
                                    {['CHECKLIST', 'MEETING', 'MAINTENANCE', 'AUDIT', 'ADMIN'].map((mod) => {
                                        // Find permission
                                        const perm = permissions.find(p => p.role === role && p.module === mod);
                                        const isAllowed = perm ? perm.allowed : (mod==='CHECKLIST' || mod==='MEETING' || mod==='MAINTENANCE'); // Default true for basic modules
                                        return (
                                            <td key={mod} className="p-3 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!isAllowed} 
                                                    onChange={() => handleTogglePermission(role, mod as any)}
                                                    className="w-5 h-5 accent-blue-600 cursor-pointer"
                                                />
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
             </Card>
        )}

        {adminTab === 'USERS' && (
          <Card>
              <h3 className="text-lg font-semibold mb-4">Gerenciar Usuários</h3>
              <p className="text-xs text-zinc-500 mb-4">Admins podem editar funções e turnos. Apenas o SuperAdmin (admin) pode criar novos admins.</p>
              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-zinc-300">
                      <thead className="text-xs text-zinc-400 uppercase bg-zinc-900/50">
                          <tr><th className="px-4 py-3">Nome</th><th className="px-4 py-3">Matrícula</th><th className="px-4 py-3">Função</th><th className="px-4 py-3">Turno</th><th className="px-4 py-3 text-center">Admin</th><th className="px-4 py-3 text-right">Ações</th></tr>
                      </thead>
                      <tbody>{usersList.map(u => (
                          <tr key={u.matricula} className="border-b border-zinc-700">
                              <td className="px-4 py-3 font-medium text-white">{u.name}</td>
                              <td className="px-4 py-3">{u.matricula}</td>
                              <td className="px-4 py-3">{u.role}</td>
                              <td className="px-4 py-3">{u.shift || '-'}</td>
                              <td className="px-4 py-3 text-center">{u.isAdmin ? <CheckCircle2 size={16} className="text-blue-500 inline"/> : '-'}</td>
                              <td className="px-4 py-3 text-right flex justify-end gap-2">
                                  { (isSuperAdmin || !u.isAdmin) && (
                                     <button onClick={() => openEditModal(u)} className="text-zinc-500 hover:text-blue-500 transition-colors" title="Editar"><Edit3 size={18} /></button>
                                  )}
                                  <button onClick={async () => { if(confirm(`Excluir ${u.name}?`)) { await deleteUser(u.matricula); setUsersList(await getAllUsers()); }}} className="text-zinc-500 hover:text-red-500 transition-colors" title="Excluir"><Trash2 size={18} /></button>
                              </td>
                          </tr>
                      ))}</tbody>
                  </table>
              </div>
          </Card>
        )}
      </Layout>
    );
  }

  // --- MENU ---
  if (view === 'MENU') { 
    return (
        <Layout>
            <div className="bg-zinc-800/50 border border-zinc-700/50 p-6 rounded-xl mb-8 flex items-center justify-between shadow-lg">
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">Painel Principal</h1>
                    <p className="text-zinc-400">Olá, <span className="text-blue-400 font-medium">{currentUser?.name}</span> ({currentUser?.role} - T{currentUser?.shift})</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => { setProfileData(currentUser); setView('PROFILE'); }}><UserIcon size={18} /> Perfil</Button>
                    <Button variant="danger" onClick={handleLogout}><LogOut size={18} /> Sair</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Checklist Card - Mostra se tiver permissão de LIDER ou MANUTENÇÃO */}
                {(hasPermission('CHECKLIST') || hasPermission('MAINTENANCE')) && (
                    <div onClick={() => setView('CHECKLIST_MENU')} className="group bg-zinc-900 p-6 rounded-2xl border border-zinc-700 hover:border-blue-500/50 hover:bg-zinc-800 transition-all cursor-pointer flex flex-col justify-between h-56 relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><CheckSquare size={100} /></div>
                        <div>
                            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-900/20"><CheckSquare size={24} /></div>
                            <h3 className="text-lg font-bold text-zinc-100">Checklist</h3>
                            <p className="text-zinc-400 text-sm mt-2">Verificação de turno, históricos e manutenção.</p>
                        </div>
                        <div className="text-blue-400 text-xs font-bold uppercase tracking-wider">Acessar</div>
                    </div>
                )}

                {/* Ata Card */}
                {hasPermission('MEETING') && (
                    <div onClick={() => setView('MEETING_MENU')} className="group bg-zinc-900 p-6 rounded-2xl border border-zinc-700 hover:border-green-500/50 hover:bg-zinc-800 transition-all cursor-pointer flex flex-col justify-between h-56 relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><FileText size={100} /></div>
                        <div>
                            <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-green-900/20"><FileText size={24} /></div>
                            <h3 className="text-lg font-bold text-zinc-100">Ata de Reunião</h3>
                            <p className="text-zinc-400 text-sm mt-2">Registro de atas, fotos e participantes online.</p>
                        </div>
                        <div className="text-green-400 text-xs font-bold uppercase tracking-wider">Acessar</div>
                    </div>
                )}

                {/* Auditoria Card */}
                 {hasPermission('AUDIT') ? (
                     <div onClick={() => setView('AUDIT_MENU')} className="group bg-zinc-900 p-6 rounded-2xl border border-zinc-700 hover:border-yellow-500/50 hover:bg-zinc-800 transition-all cursor-pointer flex flex-col justify-between h-56 relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Search size={100} /></div>
                        <div>
                            <div className="w-12 h-12 rounded-full bg-yellow-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-yellow-900/20"><Search size={24} /></div>
                            <h3 className="text-lg font-bold text-zinc-100">Auditoria</h3>
                            <p className="text-zinc-400 text-sm mt-2">Líderes, Histórico e Relatórios de Manutenção.</p>
                        </div>
                        <div className="text-yellow-400 text-xs font-bold uppercase tracking-wider">Verificar</div>
                     </div>
                 ) : (
                     <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 flex flex-col justify-between h-56 opacity-40 cursor-not-allowed">
                         <div>
                            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-600 mb-4"><Search size={24} /></div>
                            <h3 className="text-lg font-bold text-zinc-600">Auditoria</h3>
                            <p className="text-zinc-700 text-sm mt-2">Acesso restrito.</p>
                        </div>
                     </div>
                 )}

                {/* Admin Card */}
                {hasPermission('ADMIN') ? (
                    <div onClick={async () => {
                          setIsLoading(true);
                          const users = await getAllUsers();
                          setUsersList(users);
                          setIsLoading(false);
                          setView('ADMIN');
                    }} className="group bg-zinc-900 p-6 rounded-2xl border border-zinc-700 hover:border-orange-500/50 hover:bg-zinc-800 transition-all cursor-pointer flex flex-col justify-between h-56 relative overflow-hidden">
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Settings size={100} /></div>
                        <div>
                            <div className="w-12 h-12 rounded-full bg-orange-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-orange-900/20"><Settings size={24} /></div>
                            <h3 className="text-lg font-bold text-zinc-100">Administração</h3>
                            <p className="text-zinc-400 text-sm mt-2">Gestão de usuários, cargos e configurações.</p>
                        </div>
                        <div className="text-orange-400 text-xs font-bold uppercase tracking-wider">Configurar</div>
                    </div>
                ) : (
                    <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 flex flex-col justify-between h-56 opacity-40 cursor-not-allowed">
                         <div>
                            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-600 mb-4"><Settings size={24} /></div>
                            <h3 className="text-lg font-bold text-zinc-600">Administração</h3>
                            <p className="text-zinc-700 text-sm mt-2">Acesso restrito.</p>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Outros */}
            <h2 className="text-xl font-bold mb-4 text-zinc-100 border-l-4 border-zinc-500 pl-3">Futuras Atualizações (2026)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800 flex flex-col justify-between h-40 cursor-not-allowed relative overflow-hidden">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                             <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500"><AlertTriangle size={18} /></div>
                             <h3 className="text-lg font-bold text-zinc-500">Parada de Linha</h3>
                        </div>
                        <p className="text-zinc-600 text-sm">Registro de paradas e motivos (Conforme Excel).</p>
                    </div>
                    <div className="text-zinc-600 text-xs font-bold uppercase tracking-wider bg-zinc-900 inline-block px-2 py-1 rounded w-fit">Em Breve - 2026</div>
                </div>
                 <div className="bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800 flex flex-col justify-between h-40 cursor-not-allowed relative overflow-hidden">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                             <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500"><Trash2 size={18} /></div>
                             <h3 className="text-lg font-bold text-zinc-500">Scrap</h3>
                        </div>
                        <p className="text-zinc-600 text-sm">Controle de refugo e descarte (Conforme Excel).</p>
                    </div>
                    <div className="text-zinc-600 text-xs font-bold uppercase tracking-wider bg-zinc-900 inline-block px-2 py-1 rounded w-fit">Em Breve - 2026</div>
                </div>
            </div>
        </Layout>
    );
  }

  // Fallback for unknown views (fixes blank screen)
  return (
      <Layout>
          {renderPreviewModal()}
          {/* If none of the views matched above, we show an error. But actually, all views should be handled above. */}
          <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
              <h2 className="text-2xl font-bold text-red-500 mb-4">Erro de Visualização</h2>
              <p className="text-zinc-400 mb-4">A tela solicitada não foi encontrada ou houve um erro.</p>
              <Button onClick={() => setView(currentUser ? 'MENU' : 'LOGIN')}>Voltar ao Início</Button>
          </div>
      </Layout>
  );
};

export default App;