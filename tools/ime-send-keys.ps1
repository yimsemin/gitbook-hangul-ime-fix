# Windows 전용 검증 도구: 켜져 있는 Microsoft 한글 IME로 Chrome 창에 실제 키 입력을 보낸다.
# 사용: ./tools/ime-send-keys.ps1 -Title '*Page 1 - GitBook*' -Keys "rksk ekfk{HOME}{RIGHT}{RIGHT}wk "
# 글자는 두벌식 영문 자판 키(r=ㄱ, k=ㅏ)로 쓰고, 특수키는 {HOME} {END} {LEFT} {RIGHT} {ENTER} {BS} {HANGUL}(한/영 전환)로 쓴다.
# -Title은 시험용 창에만 맞는 제목 패턴이어야 한다. 일치하는 창이 정확히 1개가 아니면 아무것도 보내지 않는다.
param(
  [Parameter(Mandatory)][string]$Title,
  [Parameter(Mandatory)][string]$Keys
)
Add-Type @"
using System;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Text;
public class W{
public delegate bool EnumProc(IntPtr h,IntPtr l);
[DllImport("user32.dll")]public static extern bool EnumWindows(EnumProc p,IntPtr l);
[DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
[DllImport("user32.dll")]public static extern bool ShowWindow(IntPtr h,int c);
[DllImport("user32.dll")]public static extern void keybd_event(byte vk,byte sc,int fl,int ex);
[DllImport("user32.dll")]public static extern uint MapVirtualKey(uint c,uint t);
public static List<IntPtr> Windows(){var r=new List<IntPtr>();EnumWindows((h,l)=>{if(IsWindowVisible(h))r.Add(h);return true;},IntPtr.Zero);return r;}
public static string Text(IntPtr h){var s=new StringBuilder(512);GetWindowText(h,s,512);return s.ToString();}
}
"@
$special = @{ HOME=0x24; END=0x23; LEFT=0x25; RIGHT=0x27; ENTER=0x0D; BS=0x08; HANGUL=0x15 }
$hits = @([W]::Windows() | Where-Object { ([W]::Text($_)) -like $Title -and ([W]::Text($_)) -like '*Chrome*' })
if ($hits.Count -ne 1) { "ABORT: $($hits.Count) windows match '$Title' (need exactly 1)"; exit 1 }
$h = $hits[0]
[W]::ShowWindow($h, 9) | Out-Null
[W]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 600
if ([W]::GetForegroundWindow() -ne $h) { 'ABORT: target window is not in the foreground'; exit 1 }
$tokens = [regex]::Matches($Keys, '\{[A-Z]+\}|.')
foreach ($t in $tokens) {
  if ([W]::GetForegroundWindow() -ne $h) { 'ABORT: focus left the target window'; exit 1 }
  $s = $t.Value
  if ($s.Length -gt 1) { $vk = $special[$s.Trim('{', '}')] }
  elseif ($s -eq ' ') { $vk = 0x20 }
  else { $vk = [int][char]::ToUpper($s[0]) }
  $sc = [byte][W]::MapVirtualKey([uint32]$vk, 0)
  [W]::keybd_event($vk, $sc, 0, 0); Start-Sleep -Milliseconds 70
  [W]::keybd_event($vk, $sc, 2, 0); Start-Sleep -Milliseconds 90
}
'sent'
