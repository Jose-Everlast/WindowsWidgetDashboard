# ports – Wer belegt welchen Port?

Listet alle lauschenden TCP-Ports mit Prozessname und PID, damit du bei `EADDRINUSE` sofort siehst, was du beenden musst. Ports, die auf `0.0.0.0`, `::` oder einer LAN-Adresse lauschen, sind mit „Netz“ markiert; sie sind im Netzwerk erreichbar.

Datenquelle sind `netstat -ano` und `tasklist /fo csv /nh`, zusammen etwa 1,5 s. PowerShell und WMI kommen bewusst nicht zum Einsatz, weil sie auf dem Zielrechner 39–49 s brauchen (siehe PRD Abschnitt 7).

## Konfiguration

```json
{ "instance": "ports", "type": "ports", "x": 0, "y": 3,
  "config": {
    "minPort": 1024,
    "excludeProcesses": ["svchost.exe", "lsass.exe", "wininit.exe", "services.exe", "spoolsv.exe", "System"],
    "labels": { "3000": "relaunch-radar API", "4700": "Dashboard" }
  } }
```

- Alle Felder sind optional.
- `labels` ordnet Ports einem Projekt zu. Automatisch geht das nicht, denn die Kommandozeile eines Prozesses gibt es nur über WMI.
- Abgefragt wird alle 10 s.

## Fixtures

`server/lib/fixtures/netstat.txt` und `tasklist.csv` sind echte Ausgaben vom 2026-10-19, auf lauschende und lokale Einträge gekürzt, LAN-Adressen durch 192.0.2.x ersetzt. `fixtures/ports.json` ist die Payload eines echten Laufs.
