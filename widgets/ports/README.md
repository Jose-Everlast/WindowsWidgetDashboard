# ports – Wer belegt welchen Port?

Listet alle lauschenden TCP-Ports mit Prozessname und PID, damit du bei `EADDRINUSE` sofort siehst, was du beenden musst. Ports, die auf `0.0.0.0`, `::` oder einer LAN-Adresse lauschen, sind mit „Netz“ markiert; sie sind im Netzwerk erreichbar.

Datenquelle sind `netstat -ano` und `tasklist /fo csv /nh`, zusammen etwa 1,5 s. PowerShell und WMI kommen bewusst nicht zum Einsatz, weil sie auf dem Zielrechner 39–49 s brauchen (siehe PRD Abschnitt 7).

## Konfiguration

```json
{ "instance": "ports", "type": "ports", "x": 0, "y": 3,
  "config": {
    "minPort": 1024,
    "excludeProcesses": ["svchost.exe", "lsass.exe", "wininit.exe", "services.exe", "spoolsv.exe", "System"],
    "labels": { "3000": "relaunch-radar API", "4700": "Dashboard" },
    "allowStop": true
  } }
```

- Alle Felder sind optional.
- `allowStop: false` blendet die Stopp-Knöpfe aus, und der Server lehnt die Aktion ab.
- `labels` ordnet Ports einem Projekt zu. Automatisch geht das nicht, denn die Kommandozeile eines Prozesses gibt es nur über WMI.
- Abgefragt wird alle 10 s.

## Prozess stoppen

Fährst du mit der Maus über eine Zeile, erscheint rechts ein Stopp-Knopf. Der erste Klick macht daraus „Stoppen?“ (4 s lang), erst der zweite beendet den Prozess. Praktisch für Server, deren Terminal längst zu ist.

- Der Server prüft vorher frisch nach, ob die PID noch auf dem Port lauscht und denselben Namen hat. Sonst meldet die Kachel z. B. „Port 3000 gehört nicht mehr zu PID 18708“, und nichts wird beendet.
- Keinen Knopf haben: Systemprozesse (PID ≤ 4, `svchost.exe`, `csrss.exe`, `explorer.exe` …), Windows-Dienste (Sitzung `Services`), Prozesse ohne bekannten Namen und das Dashboard selbst.
- Beendet wird mit `taskkill /PID <pid> /F`, bewusst **ohne** `/T`: Sonst würden alle Kindprozesse mitsterben, bei `Code.exe` z. B. die Terminals samt Dashboard und Agents. Bei `npm start` lauscht der letzte Prozess der Kette (`node`), `tsx` und `npm` beenden sich danach von selbst.
- Prozesse mit Adminrechten lassen sich ohne Adminrechte nicht beenden; die Kachel zeigt das an.

## Fixtures

`server/lib/fixtures/netstat.txt` und `tasklist.csv` sind echte Ausgaben vom 2026-10-19, auf lauschende und lokale Einträge gekürzt, LAN-Adressen durch 192.0.2.x ersetzt. `fixtures/ports.json` ist die Payload eines echten Laufs.
