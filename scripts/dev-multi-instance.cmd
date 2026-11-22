@echo off
rem CMD wrapper for ProxiSpeak multi-instance workflow
rem Bypasses PowerShell script execution policy restrictions safely.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-multi-instance.ps1" %*
