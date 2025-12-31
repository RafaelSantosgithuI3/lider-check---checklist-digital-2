
/**
 * LÍDER CHECK - SERVIDOR LOCAL
 */

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware (aumentado limite para upload de backup e imagens)
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Database Setup
const db = new sqlite3.Database('./lidercheck.db', (err) => {
    if (err) console.error("Erro ao conectar BD:", err.message);
    else console.log("Conectado ao banco de dados SQLite local.");
});

// Init Tables
db.serialize(() => {
    // Tabela de Usuários
    db.run(`CREATE TABLE IF NOT EXISTS users (
        matricula TEXT PRIMARY KEY,
        name TEXT,
        role TEXT,
        shift TEXT,
        email TEXT,
        password TEXT
    )`);

    // Add is_admin column if missing
    db.run("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0", (err) => {});

    // Logs (Checklists)
    db.run(`CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        user_name TEXT,
        user_role TEXT,
        line TEXT,
        date TEXT,
        items_count INTEGER,
        ng_count INTEGER,
        observation TEXT,
        data TEXT
    )`);

    // Ata de Reunião
    db.run(`CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        title TEXT,
        date TEXT,
        start_time TEXT,
        end_time TEXT,
        photo_url TEXT,
        participants TEXT,
        topics TEXT,
        created_by TEXT
    )`);
    
    // Add columns if missing (migrations)
    db.run("ALTER TABLE meetings ADD COLUMN title TEXT", (err) => {});
    db.run("ALTER TABLE meetings ADD COLUMN start_time TEXT", (err) => {});
    db.run("ALTER TABLE meetings ADD COLUMN end_time TEXT", (err) => {});
    db.run("ALTER TABLE meetings ADD COLUMN photo_url TEXT", (err) => {});

    db.run(`CREATE TABLE IF NOT EXISTS config_items (
        id TEXT PRIMARY KEY,
        category TEXT,
        text TEXT,
        evidence TEXT,
        image_url TEXT,
        type TEXT DEFAULT 'LEADER'
    )`);
    
    // Migration for type column
    db.run("ALTER TABLE config_items ADD COLUMN type TEXT DEFAULT 'LEADER'", (err) => {});

    db.run(`CREATE TABLE IF NOT EXISTS config_lines (
        name TEXT PRIMARY KEY
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS config_roles (
        name TEXT PRIMARY KEY
    )`);
    
    // Tabela de Permissões
    db.run(`CREATE TABLE IF NOT EXISTS config_permissions (
        role TEXT,
        module TEXT,
        allowed INTEGER,
        PRIMARY KEY (role, module)
    )`);

    // Seed Admin
    db.get("SELECT matricula FROM users WHERE matricula = 'admin'", (err, row) => {
        if (!row) {
            db.run(`INSERT INTO users (matricula, name, role, shift, email, password, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['admin', 'Admin Local', 'TI', '1', 'admin@local.com', 'admin', 1]);
            console.log("Admin padrão criado.");
        }
    });

    // Seed Linhas (SE ESTIVER VAZIO)
    db.get("SELECT count(*) as count FROM config_lines", (err, row) => {
        if (row && row.count === 0) {
            const defaults = ['TP_TNP-01', 'TP_TNP-02', 'TP_TNP-03', 'TP_SEC-01', 'TP_SEC-02'];
            const stmt = db.prepare("INSERT INTO config_lines (name) VALUES (?)");
            defaults.forEach(l => stmt.run(l));
            stmt.finalize();
            console.log("Linhas padrão criadas.");
        }
    });

    // Seed Cargos
    db.get("SELECT count(*) as count FROM config_roles", (err, row) => {
        if (row && row.count === 0) {
            const defaults = [
                'Diretor', 'TI', 'Supervisor', 'Coordenador', 'Técnico de processo', 
                'Líder de produção', 'Líder do reparo/retrabalho', 'Líder da Qualidade(OQC)', 
                'Auditor', 'PQC Analista', 'Assistente de processo', 'Operador multifuncional',
                'Técnico de Manutenção'
            ];
            const stmt = db.prepare("INSERT INTO config_roles (name) VALUES (?)");
            defaults.forEach(r => stmt.run(r));
            stmt.finalize();
            console.log("Cargos padrão criados.");
        }
    });
});

// --- API ROUTES ---

app.post('/api/login', (req, res) => {
    const { matricula, password } = req.body;
    db.get("SELECT * FROM users WHERE matricula = ? AND password = ?", [matricula, password], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: "Credenciais inválidas" });
        row.isAdmin = !!row.is_admin;
        res.json({ user: row });
    });
});

app.post('/api/register', (req, res) => {
    const { matricula, name, role, shift, email, password } = req.body;
    db.run(`INSERT INTO users (matricula, name, role, shift, email, password, is_admin) VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [matricula, name, role, shift, email, password],
        function (err) {
            if (err) return res.status(400).json({ error: "Matrícula já existe ou erro no cadastro." });
            res.json({ message: "Usuário criado com sucesso!" });
        }
    );
});

app.post('/api/recover', (req, res) => {
    const { matricula, email } = req.body;
    db.get("SELECT password FROM users WHERE matricula = ? AND email = ?", [matricula, email], (err, row) => {
        if (!row) return res.status(404).json({ error: "Dados não conferem." });
        res.json({ message: `Sua senha é: ${row.password}` });
    });
});

app.get('/api/users', (req, res) => {
    db.all("SELECT * FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const users = rows.map(r => ({
            ...r,
            password: '******',
            isAdmin: !!r.is_admin
        }));
        res.json(users);
    });
});

app.delete('/api/users/:id', (req, res) => {
    db.run("DELETE FROM users WHERE matricula = ?", [req.params.id], function(err) {
        if(err) return res.status(500).json({error: err.message});
        res.json({message: "Deletado"});
    });
});

app.put('/api/users', (req, res) => {
    const { matricula, name, role, shift, email, password, isAdmin, originalMatricula } = req.body;
    
    const targetMatricula = originalMatricula || matricula;
    const adminInt = isAdmin ? 1 : 0;

    let sql = `UPDATE users SET matricula=?, name=?, role=?, shift=?, email=?, is_admin=?`;
    let params = [matricula, name, role, shift, email, adminInt];

    // Se a senha foi fornecida e não é a máscara, atualiza
    if (password && password !== '******' && password.trim() !== '') {
        sql += `, password=?`;
        params.push(password);
    }

    sql += ` WHERE matricula=?`;
    params.push(targetMatricula);

    db.run(sql, params, function(err) {
        if(err) return res.status(500).json({error: err.message});
        res.json({message: "Atualizado"});
    });
});

app.get('/api/logs', (req, res) => {
    db.all("SELECT * FROM logs ORDER BY date DESC LIMIT 1000", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const logs = rows.map(r => {
            const parsedData = JSON.parse(r.data);
            return {
                ...r,
                userId: r.user_id,
                userName: r.user_name,
                userRole: r.user_role,
                itemsCount: r.items_count,
                ngCount: r.ng_count,
                data: parsedData.answers || parsedData, // Backward compatibility
                evidenceData: parsedData.evidence || {},
                type: parsedData.type || 'PRODUCTION',
                maintenanceTarget: parsedData.maintenanceTarget
            }
        });
        res.json(logs);
    });
});

app.post('/api/logs', (req, res) => {
    const { id, userId, userName, userRole, line, date, itemsCount, ngCount, observation, data, evidenceData, type, maintenanceTarget } = req.body;
    
    // Store evidence and type inside the data blob JSON
    const storageObject = {
        answers: data,
        evidence: evidenceData,
        type: type || 'PRODUCTION',
        maintenanceTarget: maintenanceTarget
    };
    const dataStr = JSON.stringify(storageObject);
    
    db.get("SELECT id FROM logs WHERE id = ?", [id], (err, row) => {
        if (row) {
             db.run(`UPDATE logs SET line=?, items_count=?, ng_count=?, observation=?, data=? WHERE id=?`,
                [line, itemsCount, ngCount, observation, dataStr, id],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: "Log atualizado" });
                }
             );
        } else {
            db.run(`INSERT INTO logs (id, user_id, user_name, user_role, line, date, items_count, ng_count, observation, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, userId, userName, userRole, line, date, itemsCount, ngCount, observation, dataStr],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: "Log salvo" });
                }
            );
        }
    });
});

// --- MEETINGS ---

app.get('/api/meetings', (req, res) => {
    db.all("SELECT * FROM meetings ORDER BY date DESC LIMIT 500", [], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        const meetings = rows.map(r => ({
            id: r.id,
            title: r.title,
            date: r.date,
            startTime: r.start_time,
            endTime: r.end_time,
            photoUrl: r.photo_url,
            participants: JSON.parse(r.participants || '[]'),
            topics: r.topics,
            createdBy: r.created_by
        }));
        res.json(meetings);
    });
});

app.post('/api/meetings', (req, res) => {
    const { id, title, date, startTime, endTime, photoUrl, participants, topics, createdBy } = req.body;
    const participantsStr = JSON.stringify(participants);

    db.run(`INSERT INTO meetings (id, title, date, start_time, end_time, photo_url, participants, topics, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, title || '', date, startTime, endTime, photoUrl, participantsStr, topics, createdBy],
        function(err) {
            if(err) {
                console.error("Erro ao inserir ata:", err);
                return res.status(500).json({error: err.message});
            }
            res.json({message: "Ata Salva"});
        }
    );
});

// Config Items (com image_url e type)
app.get('/api/config/items', (req, res) => {
    db.all("SELECT * FROM config_items", [], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        const items = rows.map(r => ({
            id: r.id,
            category: r.category,
            text: r.text,
            evidence: r.evidence,
            imageUrl: r.image_url,
            type: r.type || 'LEADER'
        }));
        res.json(items);
    });
});

app.post('/api/config/items', (req, res) => {
    const { items } = req.body;
    db.serialize(() => {
        db.run("DELETE FROM config_items");
        const stmt = db.prepare("INSERT INTO config_items (id, category, text, evidence, image_url, type) VALUES (?, ?, ?, ?, ?, ?)");
        
        items.forEach(i => {
            stmt.run(i.id, i.category, i.text, i.evidence || '', i.imageUrl || '', i.type || 'LEADER', (err) => {
                if(err) console.error("Erro ao inserir item config:", err.message, i);
            });
        });
        
        stmt.finalize((err) => {
            if(err) return res.status(500).json({error: "Erro ao finalizar salvamento"});
            res.json({message: "Itens salvos"});
        });
    });
});

app.post('/api/config/items/reset', (req, res) => {
    db.run("DELETE FROM config_items", function(err) {
        if(err) return res.status(500).json({error: err.message});
        res.json({message: "Resetado"});
    });
});

app.get('/api/config/lines', (req, res) => {
    db.all("SELECT * FROM config_lines", [], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

app.post('/api/config/lines', (req, res) => {
    const { lines } = req.body;
    if (!lines || !Array.isArray(lines)) return res.status(400).json({error: "Formato inválido"});
    db.serialize(() => {
        db.run("DELETE FROM config_lines");
        const stmt = db.prepare("INSERT INTO config_lines (name) VALUES (?)");
        lines.forEach(l => stmt.run(l));
        stmt.finalize();
        res.json({message: "Linhas salvas"});
    });
});

app.get('/api/config/roles', (req, res) => {
    db.all("SELECT * FROM config_roles", [], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        res.json(rows);
    });
});

app.post('/api/config/roles', (req, res) => {
    const { roles } = req.body;
    if (!roles || !Array.isArray(roles)) return res.status(400).json({error: "Formato inválido"});
    db.serialize(() => {
        db.run("DELETE FROM config_roles");
        const stmt = db.prepare("INSERT INTO config_roles (name) VALUES (?)");
        roles.forEach(r => stmt.run(r));
        stmt.finalize();
        res.json({message: "Cargos salvos"});
    });
});

// Permissions
app.get('/api/config/permissions', (req, res) => {
    db.all("SELECT * FROM config_permissions", [], (err, rows) => {
        if(err) return res.status(500).json({error: err.message});
        // Convert integer back to boolean
        const perms = rows.map(r => ({
            role: r.role,
            module: r.module,
            allowed: r.allowed === 1
        }));
        res.json(perms);
    });
});

app.post('/api/config/permissions', (req, res) => {
    const { permissions } = req.body; // Array of Permission objects
    db.serialize(() => {
        db.run("DELETE FROM config_permissions");
        const stmt = db.prepare("INSERT INTO config_permissions (role, module, allowed) VALUES (?, ?, ?)");
        permissions.forEach(p => {
            stmt.run(p.role, p.module, p.allowed ? 1 : 0);
        });
        stmt.finalize();
        res.json({message: "Permissões salvas"});
    });
});

// Backup do Servidor
app.post('/api/backup/save', (req, res) => {
    const { fileName, fileData } = req.body;
    
    if (!fileName || !fileData) return res.status(400).json({error: "Dados incompletos"});

    const backupsDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsDir)){
        fs.mkdirSync(backupsDir);
    }

    const filePath = path.join(backupsDir, fileName);
    const base64Data = fileData.split(';base64,').pop();

    fs.writeFile(filePath, base64Data, {encoding: 'base64'}, (err) => {
        if (err) {
            console.error("Erro ao salvar backup:", err);
            return res.status(500).json({error: "Erro ao salvar arquivo no servidor"});
        }
        res.json({message: "Arquivo salvo no servidor com sucesso!", path: filePath});
    });
});

app.get('/api/admin/backup', (req, res) => {
    const dbPath = path.join(__dirname, 'lidercheck.db');
    if (fs.existsSync(dbPath)) {
        res.download(dbPath, 'lidercheck_backup.db');
    } else {
        res.status(404).json({ error: "Banco de dados não encontrado" });
    }
});

// Static Files
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
    const indexFile = path.join(distPath, 'index.html');
    if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
    } else {
        res.status(404).send('Servidor rodando. Execute npm run build para gerar o frontend.');
    }
});

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ SERVIDOR RODANDO! (Horário do Servidor: ${new Date().toLocaleTimeString()})`);
    console.log(`⚠️ Nota: O App usa Horário de Manaus (-4) para checklists.`);
    console.log(`--------------------------------------------------`);
    console.log(`💻 ACESSO LOCAL:     http://localhost:${PORT}`);
    console.log(`📱 ACESSO NA REDE:   http://${getLocalIp()}:${PORT}`);
    console.log(`--------------------------------------------------`);
});
