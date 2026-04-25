#define MyAppName "Lbn CRM"
#define MyAppVersion "0.1.0"
#define MyAppExeName "Lbn CRM.exe"

[Setup]
AppId={{D97BFA85-8BE5-4C6A-A6C2-LBNCRM000001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Lbn CRM
DefaultDirName={autopf}\Lbn CRM
DefaultGroupName=Lbn CRM
DisableProgramGroupPage=yes
OutputDir=C:\Users\amdmsz\Documents\LbnCrm\apps\desktop\dist
OutputBaseFilename=Lbn-CRM-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\{#MyAppExeName}

[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: checkedonce

[Files]
Source: "C:\Users\amdmsz\Documents\LbnCrm\apps\desktop\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Lbn CRM"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Lbn CRM"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Lbn CRM"; Flags: nowait postinstall skipifsilent