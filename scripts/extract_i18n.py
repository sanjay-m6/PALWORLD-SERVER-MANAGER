import os
import re
import json

# Paths
SRC_DIR = r"d:\client Project\Plaworld\src"
I18N_FILE = os.path.join(SRC_DIR, "lib", "i18n.ts")

# Regexes
# 1. JSX text content: >Some English Text<
# Matches text starting with letter/number, containing spaces or punctuation, ending with letter/number/punctuation
jsx_text_re = re.compile(r'>\s*([A-Za-z][A-Za-z0-9\s.,!?&()#\-\'\":/]+)\s*<')

# 2. JSX attributes: placeholder="Search mods..." or title="Backup details"
jsx_prop_re = re.compile(r'\b(placeholder|title|label|heading|buttonText|tooltip)="([A-Za-z][A-Za-z0-9\s.,!?&()#\-\'\":/]+)"')

# 3. Simple text inside curly braces: {"Select preset"}
jsx_braced_re = re.compile(r'{\s*["\']([A-Za-z][A-Za-z0-9\s.,!?&()#\-\'\":/]+)["\']\s*}')

# Ignore list
IGNORE_WORDS = {
    "true", "false", "null", "undefined", "className", "id", "type", "value", 
    "submit", "button", "checkbox", "text", "number", "password", "color",
    "Balanced", "Casual", "PvP", "Hardcore", "Performance"
}

def to_camel_case(s):
    # Clean text from all whitespaces for key generation
    cleaned = re.sub(r'\s+', ' ', s).strip()
    words = re.sub(r'[^a-zA-Z0-9\s]', '', cleaned).split()
    if not words:
        return ""
    # Cap key length to prevent extremely long keys
    words = words[:10]
    return words[0].lower() + "".join(w.capitalize() for w in words[1:])

def clean_text_value(s):
    # Replace all newlines and multiple spaces with a single space
    return re.sub(r'\s+', ' ', s).strip()

def extract_strings():
    extracted = {}
    
    # Walk all .ts and .tsx files
    for root, dirs, files in os.walk(SRC_DIR):
        if "node_modules" in root or "src-tauri" in root:
            continue
            
        for file in files:
            if not file.endswith((".ts", ".tsx")):
                continue
            if file == "i18n.ts":
                continue
                
            file_path = os.path.join(root, file)
            file_key_prefix = os.path.splitext(file)[0].lower()
            
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                
            # Find JSX texts
            # Use dotall-like approach to match across newlines if any, but jsx_text_re is fine if we clean matches
            for match in jsx_text_re.finditer(content):
                text = match.group(1).strip()
                cleaned_text = clean_text_value(text)
                if len(cleaned_text) > 1 and cleaned_text not in IGNORE_WORDS and not cleaned_text.startswith("http"):
                    key = f"{file_key_prefix}.{to_camel_case(cleaned_text)}"
                    extracted[cleaned_text] = key
                    
            # Find props
            for match in jsx_prop_re.finditer(content):
                prop_name, text = match.group(1), match.group(2).strip()
                cleaned_text = clean_text_value(text)
                if len(cleaned_text) > 1 and cleaned_text not in IGNORE_WORDS:
                    key = f"{file_key_prefix}.{to_camel_case(cleaned_text)}"
                    extracted[cleaned_text] = key
                    
            # Find braced strings
            for match in jsx_braced_re.finditer(content):
                text = match.group(1).strip()
                cleaned_text = clean_text_value(text)
                if len(cleaned_text) > 1 and cleaned_text not in IGNORE_WORDS:
                    key = f"{file_key_prefix}.{to_camel_case(cleaned_text)}"
                    extracted[cleaned_text] = key
                    
    return extracted

def restore_clean_i18n_base():
    # If the file had bad syntax from last run, let's restore it from a clean template
    # containing the correct base structure.
    base_content = """import { create } from 'zustand';

export type Language = 'en' | 'es' | 'de' | 'zh' | 'it' | 'ta' | 'ru';

export const LANGUAGES: Record<Language, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  zh: '简体中文',
  it: 'Italiano',
  ta: 'தமிழ்',
  ru: 'Русский'
};

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Sidebar / Layout
    'nav.dashboard': 'Dashboard',
    'nav.createServer': 'New Server',
    'nav.settings': 'Settings',
    'nav.servers': 'Servers',
    'nav.overview': 'Overview',
    'nav.config': 'Config',
    'nav.rcon': 'RCON',
    'nav.players': 'Players',
    'nav.backups': 'Backups',
    'nav.mods': 'Mod Manager',
    'nav.logs': 'Logs',
    'nav.scheduler': 'Scheduler',
    'nav.firewall': 'Firewall',
    
    // Dashboard
    'dashboard.title': 'Overview & Performance',
    'dashboard.systemPerf': 'System Performance',
    'dashboard.activeServers': 'Active Servers',
    'dashboard.totalServers': 'Total Servers',
    'dashboard.cpuUsage': 'CPU Usage',
    'dashboard.ramUsage': 'RAM Usage',
    'dashboard.serverName': 'Server Name',
    'dashboard.status': 'Status',
    'dashboard.players': 'Players',
    'dashboard.uptime': 'Uptime',
    'dashboard.actions': 'Actions',
    'dashboard.manage': 'Manage',
    'dashboard.start': 'Start',
    'dashboard.stop': 'Stop',
    'dashboard.restart': 'Restart',
    'dashboard.console': 'Console',
    'dashboard.update': 'Update',
    
    // Create Server
    'createServer.title': 'Create New Dedicated Server',
    'createServer.name': 'Server Name',
    'createServer.desc': 'Server Description',
    'createServer.port': 'Game Port',
    'createServer.maxPlayers': 'Max Players',
    'createServer.adminPassword': 'Admin Password',
    'createServer.serverPassword': 'Server Password (Optional)',
    'createServer.button': 'Create Server',
    
    // Mods tab
    'mods.installedInventory': 'Installed Inventory',
    'mods.fileBrowser': 'Mod File Browser',
    'mods.discoverMods': 'Discover Mods',
    'mods.configEditor': 'PalModSettings.ini',
    'mods.oneClickInstall': 'One-Click Install',
    'mods.installed': '✓ Installed',
    'mods.installing': 'Installing...',
    
    // Settings tab
    'settings.title': 'Application Settings',
    'settings.language': 'Language Selection',
    'settings.save': 'Save Settings',
    'settings.minimizeToTray': 'Minimize to Tray',
    'settings.runOnStartup': 'Run on PC Startup',
    'settings.defaultPort': 'Default Server Port',
    'settings.customSteamcmd': 'Custom SteamCMD Path (Optional)',
    'settings.firewallBtn': 'Setup Firewall Rules',
    'settings.checkUpdates': 'Check for Updates',
    'settings.autoUpdate': 'Enable Auto-Update',
  },
  es: {
    // Sidebar / Layout
    'nav.dashboard': 'Panel de Control',
    'nav.createServer': 'Nuevo Servidor',
    'nav.settings': 'Configuración',
    'nav.servers': 'Servidores',
    'nav.overview': 'Resumen',
    'nav.config': 'Configuración',
    'nav.rcon': 'RCON',
    'nav.players': 'Jugadores',
    'nav.backups': 'Copias de Seguridad',
    'nav.mods': 'Mod Manager',
    'nav.logs': 'Registros',
    'nav.scheduler': 'Programador',
    'nav.firewall': 'Cortafuegos',
    
    // Dashboard
    'dashboard.title': 'Resumen y Rendimiento',
    'dashboard.systemPerf': 'Rendimiento del Sistema',
    'dashboard.activeServers': 'Servidores Activos',
    'dashboard.totalServers': 'Servidores Totales',
    'dashboard.cpuUsage': 'Uso de CPU',
    'dashboard.ramUsage': 'Uso de RAM',
    'dashboard.serverName': 'Nombre del Servidor',
    'dashboard.status': 'Estado',
    'dashboard.players': 'Jugadores',
    'dashboard.uptime': 'Tiempo de Actividad',
    'dashboard.actions': 'Acciones',
    'dashboard.manage': 'Gestionar',
    'dashboard.start': 'Iniciar',
    'dashboard.stop': 'Detener',
    'dashboard.restart': 'Reiniciar',
    'dashboard.console': 'Consola',
    'dashboard.update': 'Actualizar',
    
    // Create Server
    'createServer.title': 'Crear Nuevo Servidor Dedicado',
    'createServer.name': 'Nombre del Servidor',
    'createServer.desc': 'Descripción del Servidor',
    'createServer.port': 'Puerto de Juego',
    'createServer.maxPlayers': 'Límite de Jugadores',
    'createServer.adminPassword': 'Contraseña de Administrador',
    'createServer.serverPassword': 'Contraseña del Servidor (Opcional)',
    'createServer.button': 'Crear Servidor',
    
    // Mods tab
    'mods.installedInventory': 'Inventario Instalado',
    'mods.fileBrowser': 'Explorador de Archivos',
    'mods.discoverMods': 'Descubrir Mods',
    'mods.configEditor': 'PalModSettings.ini',
    'mods.oneClickInstall': 'Instalar con un clic',
    'mods.installed': '✓ Instalado',
    'mods.installing': 'Instalando...',
    
    // Settings tab
    'settings.title': 'Ajustes de la Aplicación',
    'settings.language': 'Selección de Idioma',
    'settings.save': 'Guardar Ajustes',
    'settings.minimizeToTray': 'Minimizar a la Bandeja',
    'settings.runOnStartup': 'Iniciar con Windows',
    'settings.defaultPort': 'Puerto por Defecto',
    'settings.customSteamcmd': 'Ruta de SteamCMD (Opcional)',
    'settings.firewallBtn': 'Configurar Reglas del Cortafuegos',
    'settings.checkUpdates': 'Buscar Actualizaciones',
    'settings.autoUpdate': 'Habilitar Actualización Automática',
  },
  de: {
    // Sidebar / Layout
    'nav.dashboard': 'Dashboard',
    'nav.createServer': 'Neuer Server',
    'nav.settings': 'Einstellungen',
    'nav.servers': 'Server',
    'nav.overview': 'Übersicht',
    'nav.config': 'Konfiguration',
    'nav.rcon': 'RCON',
    'nav.players': 'Spieler',
    'nav.backups': 'Backups',
    'nav.mods': 'Mod-Manager',
    'nav.logs': 'Logs',
    'nav.scheduler': 'Scheduler',
    'nav.firewall': 'Firewall',
    
    // Dashboard
    'dashboard.title': 'Übersicht & Leistung',
    'dashboard.systemPerf': 'Systemleistung',
    'dashboard.activeServers': 'Aktive Server',
    'dashboard.totalServers': 'Server Gesamt',
    'dashboard.cpuUsage': 'CPU-Auslastung',
    'dashboard.ramUsage': 'RAM-Auslastung',
    'dashboard.serverName': 'Servername',
    'dashboard.status': 'Status',
    'dashboard.players': 'Spieler',
    'dashboard.uptime': 'Laufzeit',
    'dashboard.actions': 'Aktionen',
    'dashboard.manage': 'Verwalten',
    'dashboard.start': 'Starten',
    'dashboard.stop': 'Stoppen',
    'dashboard.restart': 'Neustarten',
    'dashboard.console': 'Konsole',
    'dashboard.update': 'Aktualisieren',
    
    // Create Server
    'createServer.title': 'Neuen dedizierten Server erstellen',
    'createServer.name': 'Servername',
    'createServer.desc': 'Serverbeschreibung',
    'createServer.port': 'Spielport',
    'createServer.maxPlayers': 'Maximaler Spieler',
    'createServer.adminPassword': 'Admin-Passwort',
    'createServer.serverPassword': 'Server-Passwort (Optional)',
    'createServer.button': 'Server erstellen',
    
    // Mods tab
    'mods.installedInventory': 'Installierte Mods',
    'mods.fileBrowser': 'Mod-Datei-Browser',
    'mods.discoverMods': 'Mods entdecken',
    'mods.configEditor': 'PalModSettings.ini',
    'mods.oneClickInstall': 'Ein-Klick-Installation',
    'mods.installed': '✓ Installiert',
    'mods.installing': 'Installiere...',
    
    // Settings tab
    'settings.title': 'Anwendungseinstellungen',
    'settings.language': 'Sprachauswahl',
    'settings.save': 'Einstellungen speichern',
    'settings.minimizeToTray': 'In den Systemtray minimieren',
    'settings.runOnStartup': 'Mit Windows starten',
    'settings.defaultPort': 'Standard-Serverport',
    'settings.customSteamcmd': 'Benutzerdefinierter SteamCMD-Pfad',
    'settings.firewallBtn': 'Firewall-Regeln einrichten',
    'settings.checkUpdates': 'Auf Updates prüfen',
    'settings.autoUpdate': 'Auto-Update aktivieren',
  },
  zh: {
    // Sidebar / Layout
    'nav.dashboard': '仪表盘',
    'nav.createServer': '新建服务器',
    'nav.settings': '应用设置',
    'nav.servers': '服务器列表',
    'nav.overview': '总览',
    'nav.config': '参数设置',
    'nav.rcon': 'RCON 控制台',
    'nav.players': '玩家管理',
    'nav.backups': '备份管理',
    'nav.mods': '模组管理器',
    'nav.logs': '运行日志',
    'nav.scheduler': '计划任务',
    'nav.firewall': '防火墙设置',
    
    // Dashboard
    'dashboard.title': '总览与性能',
    'dashboard.systemPerf': '系统性能指标',
    'dashboard.activeServers': '运行中服务器',
    'dashboard.totalServers': '总服务器数',
    'dashboard.cpuUsage': 'CPU 使用率',
    'dashboard.ramUsage': '内存使用率',
    'dashboard.serverName': '服务器名称',
    'dashboard.status': '运行状态',
    'dashboard.players': '在线玩家',
    'dashboard.uptime': '在线时间',
    'dashboard.actions': '快捷操作',
    'dashboard.manage': '管理',
    'dashboard.start': '开启',
    'dashboard.stop': '关闭',
    'dashboard.restart': '重启',
    'dashboard.console': '终端',
    'dashboard.update': '更新',
    
    // Create Server
    'createServer.title': '创建新专用服务器',
    'createServer.name': '服务器名称',
    'createServer.desc': '服务器描述',
    'createServer.port': '游戏端口',
    'createServer.maxPlayers': '最大人数',
    'createServer.adminPassword': '管理员密码',
    'createServer.serverPassword': '服务器密码 (选填)',
    'createServer.button': '创建服务器',
    
    // Mods tab
    'mods.installedInventory': '已安装模组',
    'mods.fileBrowser': '模组文件浏览器',
    'mods.discoverMods': '浏览在线模组',
    'mods.configEditor': 'PalModSettings.ini',
    'mods.oneClickInstall': '一键安装',
    'mods.installed': '✓ 已安装',
    'mods.installing': '正在安装...',
    
    // Settings tab
    'settings.title': '系统设置',
    'settings.language': '语言选择',
    'settings.save': '保存设置',
    'settings.minimizeToTray': '最小化至系统托盘',
    'settings.runOnStartup': '开机自动运行',
    'settings.defaultPort': '默认服务器端口',
    'settings.customSteamcmd': '自定义 SteamCMD 路径 (可选)',
    'settings.firewallBtn': '配置防火墙规则',
    'settings.checkUpdates': '检查更新',
    'settings.autoUpdate': '启用自动更新',
  },
  it: {
    // Sidebar / Layout
    'nav.dashboard': 'Dashboard',
    'nav.createServer': 'Nuovo Server',
    'nav.settings': 'Impostazioni',
    'nav.servers': 'Server',
    'nav.overview': 'Panoramica',
    'nav.config': 'Configurazione',
    'nav.rcon': 'RCON',
    'nav.players': 'Giocatori',
    'nav.backups': 'Backup',
    'nav.mods': 'Mod Manager',
    'nav.logs': 'Log',
    'nav.scheduler': 'Pianificazione',
    'nav.firewall': 'Firewall',
    
    // Dashboard
    'dashboard.title': 'Panoramica e Prestazioni',
    'dashboard.systemPerf': 'Prestazioni di Sistema',
    'dashboard.activeServers': 'Server Attivi',
    'dashboard.totalServers': 'Server Totali',
    'dashboard.cpuUsage': 'Uso CPU',
    'dashboard.ramUsage': 'Uso RAM',
    'dashboard.serverName': 'Nome Server',
    'dashboard.status': 'Stato',
    'dashboard.players': 'Giocatori',
    'dashboard.uptime': 'Uptime',
    'dashboard.actions': 'Azioni',
    'dashboard.manage': 'Gestisci',
    'dashboard.start': 'Avvia',
    'dashboard.stop': 'Ferma',
    'dashboard.restart': 'Riavvia',
    'dashboard.console': 'Console',
    'dashboard.update': 'Aggiorna',
    
    // Create Server
    'createServer.title': 'Crea Nuovo Server Dedicato',
    'createServer.name': 'Nome Server',
    'createServer.desc': 'Descrizione Server',
    'createServer.port': 'Porta di Gioco',
    'createServer.maxPlayers': 'Max Giocatori',
    'createServer.adminPassword': 'Password Amministratore',
    'createServer.serverPassword': 'Password Server (Opzionale)',
    'createServer.button': 'Crea Server',
    
    // Mods tab
    'mods.installedInventory': 'Inventario Mod',
    'mods.fileBrowser': 'Visualizzatore File',
    'mods.discoverMods': 'Scopri Mod',
    'mods.configEditor': 'PalModSettings.ini',
    'mods.oneClickInstall': 'Installazione 1-Click',
    'mods.installed': '✓ Installato',
    'mods.installing': 'Installazione...',
    
    // Settings tab
    'settings.title': 'Impostazioni Applicazione',
    'settings.language': 'Selezione Lingua',
    'settings.save': 'Salva Impostazioni',
    'settings.minimizeToTray': 'Riduci a icona nel vassoio',
    'settings.runOnStartup': 'Avvia all\\\'avvio del PC',
    'settings.defaultPort': 'Porta Server Predefinita',
    'settings.customSteamcmd': 'Percorso SteamCMD Personalizzato',
    'settings.firewallBtn': 'Configura Regole Firewall',
    'settings.checkUpdates': 'Controlla Aggiornamenti',
  },
  ta: {
    // Sidebar / Layout
    'nav.dashboard': 'டாஷ்போர்டு',
    'nav.createServer': 'புதிய சர்வர்',
    'nav.settings': 'அமைப்புகள்',
    'nav.servers': 'சர்வர்கள்',
    'nav.overview': 'கண்ணோட்டம்',
    'nav.config': 'கட்டமைப்பு',
    'nav.rcon': 'RCON',
    'nav.players': 'வீரர்கள்',
    'nav.backups': 'காப்புப்பிரதிகள்',
    'nav.mods': 'மோட் மேலாளர்',
    'nav.logs': 'பதிவுகள்',
    'nav.scheduler': 'அட்டவணைப்படுத்தி',
    'nav.firewall': 'பயர்வால்',
    
    // Dashboard
    'dashboard.title': 'கண்ணோட்டம் மற்றும் செயல்திறன்',
    'dashboard.systemPerf': 'கணினி செயல்திறன்',
    'dashboard.activeServers': 'செயலில் உள்ள சர்வர்கள்',
    'dashboard.totalServers': 'மொத்த சர்வர்கள்',
    'dashboard.cpuUsage': 'CPU பயன்பாடு',
    'dashboard.ramUsage': 'RAM பயன்பாடு',
    'dashboard.serverName': 'சர்வர் பெயர்',
    'dashboard.status': 'நிலை',
    'dashboard.players': 'வீரர்கள்',
    'dashboard.uptime': 'செயல் நேரம்',
    'dashboard.actions': 'செயல்கள்',
    'dashboard.manage': 'நிர்வகி',
    'dashboard.start': 'தொடங்கு',
    'dashboard.stop': 'நிறுத்து',
    'dashboard.restart': 'மீண்டும் தொடங்கு',
    'dashboard.console': 'கான்சோல்',
    'dashboard.update': 'புதுப்பி',
    
    // Create Server
    'createServer.title': 'புதிய பிரத்யேக சேவையகத்தை உருவாக்கு',
    'createServer.name': 'சர்வர் பெயர்',
    'createServer.desc': 'சர்வர் விளக்கம்',
    'createServer.port': 'விளையாட்டு போர்ட்',
    'createServer.maxPlayers': 'அதிகபட்ச வீரர்கள்',
    'createServer.adminPassword': 'நிர்வாகி கடவுச்சொல்',
    'createServer.serverPassword': 'சர்வர் கடவுச்சொல் (விருப்பத்திற்குரியது)',
    'createServer.button': 'சர்வரை உருவாக்கு',
    
    // Mods tab
    'mods.installedInventory': 'நிறுவப்பட்ட மோட்ஸ்',
    'mods.fileBrowser': 'மோட் கோப்பு உலாவி',
    'mods.discoverMods': 'மோட்களைக் கண்டறியவும்',
    'mods.configEditor': 'PalModSettings.ini',
    'mods.oneClickInstall': 'ஒரே கிளிக்கில் நிறுவல்',
    'mods.installed': '✓ நிறுவப்பட்டது',
    'mods.installing': 'நிறுவப்படுகிறது...',
    
    // Settings tab
    'settings.title': 'பயன்பாட்டு அமைப்புகள்',
    'settings.language': 'மொழியைத் தேர்ந்தெடு',
    'settings.save': 'அமைப்புகளைச் சேமி',
    'settings.minimizeToTray': 'சிஸ்டம் டிரேவிற்கு நகர்த்து',
    'settings.runOnStartup': 'கணினி தொடங்கும் போது இயக்கு',
    'settings.defaultPort': 'இயல்புநிலை சர்வர் போர்ட்',
    'settings.customSteamcmd': 'விருப்பமான SteamCMD பாதை',
    'settings.firewallBtn': 'பயர்வால் விதிகளை அமை',
    'settings.checkUpdates': 'புதுப்பிப்புகளைச் சரிபார்',
  },
  ru: {
    // Sidebar / Layout
    'nav.dashboard': 'Панель управления',
    'nav.createServer': 'Новый сервер',
    'nav.settings': 'Настройки',
    'nav.servers': 'Серверы',
    'nav.overview': 'Обзор',
    'nav.config': 'Конфигурация',
    'nav.rcon': 'RCON',
    'nav.players': 'Игроки',
    'nav.backups': 'Резервные копии',
    'nav.mods': 'Менеджер модов',
    'nav.logs': 'Логи',
    'nav.scheduler': 'Планировщик',
    'nav.firewall': 'Брандмауэр',
    
    // Dashboard
    'dashboard.title': 'Обзор и производительность',
    'dashboard.systemPerf': 'Производительность системы',
    'dashboard.activeServers': 'Активные серверы',
    'dashboard.totalServers': 'Всего серверов',
    'dashboard.cpuUsage': 'Нагрузка CPU',
    'dashboard.ramUsage': 'Использование RAM',
    'dashboard.serverName': 'Имя сервера',
    'dashboard.status': 'Статус',
    'dashboard.players': 'Игроки',
    'dashboard.uptime': 'Время работы',
    'dashboard.actions': 'Действия',
    'dashboard.manage': 'Управлять',
    'dashboard.start': 'Запустить',
    'dashboard.stop': 'Остановить',
    'dashboard.restart': 'Перезапустить',
    'dashboard.console': 'Консоль',
    'dashboard.update': 'Обновить',
    
    // Create Server
    'createServer.title': 'Создать новый выделенный сервер',
    'createServer.name': 'Имя сервера',
    'createServer.desc': 'Описание сервера',
    'createServer.port': 'Игровой порт',
    'createServer.maxPlayers': 'Макс. игроков',
    'createServer.adminPassword': 'Пароль администратора',
    'createServer.serverPassword': 'Пароль сервера (Опционально)',
    'createServer.button': 'Создать сервер',
    
    // Mods tab
    'mods.installedInventory': 'Установленные моды',
    'mods.fileBrowser': 'Проводник файлов мода',
    'mods.discoverMods': 'Найти моды',
    'mods.configEditor': 'PalModSettings.ini',
    'mods.oneClickInstall': 'Установка в один клик',
    'mods.installed': '✓ Установлено',
    'mods.installing': 'Установка...',
    
    // Settings tab
    'settings.title': 'Настройки приложения',
    'settings.language': 'Выбор языка',
    'settings.save': 'Сохранить настройки',
    'settings.minimizeToTray': 'Сворачивать в трей',
    'settings.runOnStartup': 'Запуск при старте системы',
    'settings.defaultPort': 'Порт сервера по умолчанию',
    'settings.customSteamcmd': 'Путь к SteamCMD (Опционально)',
    'settings.firewallBtn': 'Настроить брандмауэр',
    'settings.checkUpdates': 'Проверить обновления',
  }
};

interface I18nStore {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

export const useI18nStore = create<I18nStore>((set, get) => ({
  language: (localStorage.getItem('app_language') as Language) || 'en',
  setLanguage: (lang: Language) => {
    localStorage.setItem('app_language', lang);
    set({ language: lang });
  },
  t: (key: string) => {
    const lang = get().language;
    return translations[lang]?.[key] || translations['en']?.[key] || key;
  }
}));
"""
    with open(I18N_FILE, "w", encoding="utf-8") as f:
        f.write(base_content)

def update_i18n_file(extracted_strings):
    if not os.path.exists(I18N_FILE):
        print(f"i18n file not found at: {I18N_FILE}")
        return
        
    with open(I18N_FILE, "r", encoding="utf-8") as f:
        content = f.read()
        
    languages = ['en', 'es', 'de', 'zh', 'it', 'ta', 'ru']
    
    for lang in languages:
        # Locate the block for this language
        pattern = rf'({lang}:\s*\{{)([^}}]+)(\}})'
        match = re.search(pattern, content)
        if match:
            header = match.group(1)
            body = match.group(2)
            footer = match.group(3)
            
            # Parse existing keys from the body
            existing_keys = set(re.findall(r'\'([^\']+)\'\s*:', body))
            
            # Build list of new lines to add
            new_lines = []
            for text, key in extracted_strings.items():
                if key not in existing_keys:
                    # Clean text and escape single quotes safely
                    safe_text = text.replace("'", "\\'")
                    new_lines.append(f"    '{key}': '{safe_text}',")
                    existing_keys.add(key)
            
            if new_lines:
                new_body = body.rstrip() + "\n" + "\n".join(new_lines) + "\n  "
                content = content.replace(match.group(0), f"{header}{new_body}{footer}")
                print(f"Added {len(new_lines)} keys to language: {lang}")
                
    with open(I18N_FILE, "w", encoding="utf-8") as f:
        f.write(content)
        
    print("i18n.ts update complete!")

if __name__ == "__main__":
    print("Restoring clean i18n base file to reset invalid newlines...")
    restore_clean_i18n_base()
    
    print("Extracting user-facing strings...")
    found = extract_strings()
    print(f"Found {len(found)} unique strings.")
    for text, key in list(found.items())[:10]:
        print(f"  '{text}' -> '{key}'")
    if len(found) > 10:
        print(f"  ... and {len(found) - 10} more")
        
    update_i18n_file(found)
