' run-hidden.vbs - silent launcher for GanttCalendar Web.
' Usage: wscript.exe run-hidden.vbs <start|api|web>
' Starts each service in a hidden console window with output redirected to
' web\logs\*.log. Deliberately does NOT re-parse a .bat inside the hidden
' console (cmd's batch parser is fragile with spaces/quotes/long paths);
' instead each mode runs one explicit command line.
Option Explicit

Dim mode, fso, sh, webDir, logs, exe
If WScript.Arguments.Count < 1 Then WScript.Quit 1
mode = LCase(WScript.Arguments(0))

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")
webDir = fso.GetParentFolderName(WScript.ScriptFullName)
logs   = webDir & "\logs"
exe    = webDir & "\.venv\Scripts\python.exe"

On Error Resume Next
fso.CreateFolder logs
On Error GoTo 0

sh.CurrentDirectory = webDir

' windowStyle 0 = hidden, waitOnReturn False = don't block.
' cmd.exe /c strips an outer quote pair, so the whole command is wrapped
' in an extra pair of double quotes.
If mode = "start" Then
  sh.Run "cmd.exe /d /c """"" & exe & """ -m uvicorn server.main:app --host 127.0.0.1 --port 8010 > """ & logs & "\api-server.log"" 2>&1""", 0, False
  sh.Run "cmd.exe /d /c npm.cmd run dev > """ & logs & "\web-server.log"" 2>&1", 0, False
  WScript.Quit 0
End If

If mode = "api" Then
  sh.Run "cmd.exe /d /c """"" & exe & """ -m uvicorn server.main:app --host 127.0.0.1 --port 8010 > """ & logs & "\api-server.log"" 2>&1""", 0, False
  WScript.Quit 0
End If

If mode = "web" Then
  sh.Run "cmd.exe /d /c npm.cmd run dev > """ & logs & "\web-server.log"" 2>&1", 0, False
  WScript.Quit 0
End If

WScript.Quit 1
