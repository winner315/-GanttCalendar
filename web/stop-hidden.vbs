' stop-hidden.vbs - silently stop GanttCalendar Web services (api 8010 / web 5174).
' Runs hidden (window style 0, no console). Uses built-in Split() on the
' netstat line and picks the last NON-EMPTY token as the owning PID, so it
' still works if the line ends with trailing spaces.
Option Explicit

Dim sh, i, ports
Set sh = CreateObject("WScript.Shell")

ports = Array2("8010", "5174")
For i = 0 To 1
  Call StopPort(ports(i))
Next

' brief pause so the OS finishes closing the killed process trees
WScript.Sleep 800
WScript.Quit 0

Sub StopPort(p)
  Dim out, lines, ln, toks, pid, k
  out = sh.Exec("cmd.exe /c netstat -ano | findstr "":" & p & " """).StdOut.ReadAll()
  lines = Split(out, vbCrLf)
  For Each ln In lines
    ln = Trim(ln)
    If InStr(ln, "LISTENING") > 0 Then
      toks = Split(ln, " ")
      pid = ""
      For k = UBound(toks) To 0 Step -1
        If Trim(toks(k)) <> "" Then
          pid = Trim(toks(k))
          Exit For
        End If
      Next
      If pid <> "" Then
        On Error Resume Next
        sh.Run "cmd.exe /c taskkill /T /F /PID " & pid, 0, True
        On Error GoTo 0
      End If
    End If
  Next
End Sub

Function Array2(a, b)
  Dim t(1)
  t(0) = a : t(1) = b
  Array2 = t
End Function