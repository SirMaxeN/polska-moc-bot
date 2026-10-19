# BotyslawSmith player walkthrough: repeatable production guide

## Current edition and style
Edition: 2026-10-15-v4. Deliver an edited walkthrough from genuine Discord screenshots with Polish synthetic narration. Cover the public welcome buttons on the bot channel, /start, /help, /update, /costs, all four reports, the tutorial link on that channel and the reminder-channel notification/mute menus. No administrator tutorial. Never say "nick" in narration: use "nazwa gracza". Do not end with "Gotowe".

Keep 1920×1080, 24 fps, H.264/AAC MP4; navy #11151f, mint #6fe4bd, white headings, short left-side Polish instructions and a legible cropped Discord view on the right. Use pl-PL-MarekNeural at +15% (previous edition: +5%). Keep 250 ms fades and only 250 ms pause after narration (previous edition: 800 ms). No music. Do not squeeze whole dense reports into tiny images: crop relevant sections and show additional shots when needed.

## Capture procedure
Use the authenticated existing Discord tab and visible browser controls. The bot channel is https://discord.com/channels/1540254259348512848/1560053772732858399; the reminder channel is https://discord.com/channels/1540254259348512848/1560055122510487572. Capture the welcome and click its Start button, then capture the private menu. Show the tutorial link that is already posted on the bot channel. Show current five-field resources and two-field costs without saving changes. Capture personal, clan, detailed and ultra reports; ultra sends separate messages for each day.

For notifications, right-click the reminder channel and open Notification Settings: show Nothing without changing the saved selection. For muting, right-click and expand Mute Channel with ArrowRight on the focused menu item; clicking the parent item may toggle mute immediately. Show duration options including Until I turn it back on. Do not leave the user's settings changed. If a demonstration toggles mute, restore the original state and verify the menu says Mute Channel. The UI is English in these captures; explain the Polish meaning in narration. Hide unrelated conversation text in the delivered crops.

## Reproduction
The authoritative scene metadata and exact Polish narration are in docs/demo/2026-10-15-v4/scenes.json. Build with Python, Pillow, edge-tts and imageio-ffmpeg: python docs/demo/build_walkthrough.py docs/demo/2026-10-15-v4. Add --cards-only to review the contact sheet first. For future editions create a new dated folder and recapture changed screens. Voice cache keys include the voice, speed and narration text; changed speech must regenerate. Only narration text is sent to the speech service; screenshots stay local.

Check every card for safe margins and legibility, then verify the final MP4 dimensions/audio and fully decode it. Save chapters.json and verification.json. subtitles.srt has approximate sentence timing. Do not reuse the obsolete unversioned video or the first edition as the current version. Preserve the visual style and faster pacing for later recordings.

## Slash commands and access
Use exactly one slide for commands. Demonstrate /start suggestions and summarize /start, /help, /update, /costs and /report. Say only that some commands are restricted to management; do not list or explain administrator commands. Commands work on server channels where they are permitted. Prefer the buttons for everyday use.

## Exact storyboard and Polish narration

### 1. Kanał bota: Zacznij od przycisku Start
Visual: 00-welcome.png; crop [447, 456, 727, 817].
On-screen: Otwórz kanał botysław-smith.; Znajdź wiadomość powitalną.; Kliknij Start albo Pomoc.; To najwygodniejszy sposób rozpoczęcia.
Narration: Cześć! Otwórz kanał Botysław Smith i znajdź wiadomość powitalną. Pod nią są przyciski Start i Pomoc. Kliknij Start, aby rozpocząć pracę z botem. Polecam korzystać właśnie z tych przycisków. Na tym samym kanale znajdziesz również ten poradnik.

### 2. /start: Wszystko pod ręką
Visual: 01-start.png; crop [390, 423, 749, 793].
On-screen: Wybieraj przyciski zamiast komend.; Menu i raporty widzisz tylko Ty.; Na tym kanale znajdziesz też poradnik.
Narration: Po kliknięciu Start otwiera się prywatne menu. Stąd wybierzesz dane, koszty i wszystkie raporty. Zachęcam do korzystania z tych przycisków. Nie musisz za każdym razem wpisywać komend.

### 3. Komendy z /: Możesz też wpisać komendę
Visual: 12-report-commands.png; crop [390, 482, 743, 875].
On-screen: Wpisz / na czacie i wybierz komendę bota.; /start, /help, /update, /costs; /report: wybierz rodzaj raportu.; Część poleceń jest tylko dla zarządu.
Narration: Możesz też wpisać ukośnik na dowolnym czacie serwera, gdzie komendy są dozwolone. Wybierz polecenie Botysława i zatwierdź Enterem. Podstawowe komendy to start, help, update, costs oraz report z wybranym rodzajem raportu. Część poleceń jest dostępna tylko dla zarządu. Na co dzień najwygodniej korzystać z przycisków.

### 4. /help: Pomoc dla gracza
Visual: 02-help-reports.png; crop [447, 197, 726, 374].
On-screen: Jak wpisać zasoby i koszty.; Opis czterech raportów.; Przyciski do formularzy.
Narration: Jeśli potrzebujesz przypomnienia, wybierz Pomoc albo wpisz help. Znajdziesz tu opis aktualizacji danych, kosztów i czterech rodzajów raportów. Z pomocy przejdziesz od razu do formularza.

### 5. /update: Pięć osobnych pól
Visual: 03-update-form.png; crop [143, 95, 623, 789].
On-screen: Bilety, klucze i młotki.; Zwierzaki lub jajka: bez 3 bazowych.; Wierzchowce: bez 1 bazowego.; Pokaz formularza bez zapisywania.
Narration: Komenda update od razu otwiera formularz. Podaj bilety umiejętności, klucze wierzchowców i młotki. Następnie wpisz zwierzaki lub jajka do połączenia, bez trzech bazowych, oraz posiadane wierzchowce czekające na połączenie, bez jednego bazowego. Tutaj tylko pokazujemy formularz, bez zmiany zapisanych danych.

### 6. /update: Format jest prosty
Visual: 03-update-form.png; crop [143, 95, 623, 789].
On-screen: 9550 = 9,55 = 9.55; 9,55k i 9.55k też działają.; Puste pole zachowuje wartość.; 0 zeruje dany zasób.
Narration: Możesz wpisać dziewięć tysięcy pięćset pięćdziesiąt albo dziewięć przecinek pięćdziesiąt pięć. Kropka działa tak samo jak przecinek. Litera ka jest opcjonalna. Puste pole zachowuje poprzednią wartość, a zero zeruje dany zasób. Po wydaniu zasobów wpisz ich nowy stan.

### 7. /costs: Twoje koszty przywołań
Visual: 04-costs.png; crop [143, 239, 623, 645].
On-screen: Koszt 5 umiejętności.; Koszt 1 wierzchowca.; Domyślnie: 200 i 50.; Dodatnie liczby całkowite.; Zostają po resecie tygodnia.
Narration: Koszty ustawiasz osobno komendą costs. Pierwsze pole to cena pięciu umiejętności, drugie to cena jednego wierzchowca. Domyślnie to dwieście i pięćdziesiąt. Wpisuj dodatnie liczby całkowite. Koszty zostają po resecie tygodnia. Zmieniaj je, kiedy ulepszysz własną technologię.

### 8. /report player: Twój potencjał
Visual: 05-player.png; crop [447, 347, 727, 776].
On-screen: Zasoby i punkty za akcje.; Czerwony: minął. Zielony: bieżący.; Przy bieżącym: czas do końca.; Dzień 1: wtorek od 02:00.
Narration: Mój raport pokazuje zapisane zasoby i Twój potencjał na sześć dni, z punktami za poszczególne akcje. Minione dni są czerwone i przekreślone, bieżący jest zielony, a przyszłe białe. Przy bieżącym dniu widzisz czas do końca. Dzień pierwszy zaczyna się we wtorek o drugiej w nocy czasu polskiego.

### 9. /report clan: Suma całego klanu
Visual: 06-clan.png; crop [447, 472, 727, 792].
On-screen: Wszyscy wpisani gracze.; Każdy dzień to osobny scenariusz.; Nie sumujemy wyników dni.; Po wydaniu zasobów: /update.
Narration: Raport klanu sumuje potencjał wszystkich wpisanych graczy na każdy dzień. Pamiętaj: każdy dzień jest osobnym scenariuszem wydania tych samych zasobów. Nie dodawaj wyników różnych dni. Jeśli wydasz zasoby, zaktualizuj stan, żeby kolejne raporty były dokładne.

### 10. /report clan-details: Gracze i świeżość danych
Visual: 07-details.png; crop [447, 169, 727, 603].
On-screen: Wynik każdego gracza.; Zegarek i data aktualizacji.; Suma klanu pod dniem.; Pełna lista graczy.
Narration: Szczegóły klanu pokazują wynik każdego gracza osobno oraz sumę dnia. Pod nazwą gracza znajdziesz zegarek i datę ostatniej aktualizacji zasobów. Dzięki temu wiesz, czy dane są świeże.

### 11. /report clan-ultra: Punkty za każdą akcję
Visual: 08-ultra.png; crop [447, 229, 727, 579].
On-screen: Każdy gracz rozpisany na akcje.; Osobna wiadomość na każdy dzień.; Duży dzień: dodatkowe części.
Narration: Ultra szczegóły dodają rozbicie punktów każdego gracza na konkretne akcje, podobnie jak w Moim raporcie. Każdy dzień dostaje osobną wiadomość, żeby łatwiej było go odczytać. Przy dużym klanie jeden dzień może mieć dodatkowe części.

### 12. Kanał przypomnień: Powiadomienia po Twojemu
Visual: 09-notifications.png; crop [224, 581, 596, 779].
On-screen: Prawy przycisk na kanale przypomnień.; Notification Settings: powiadomienia.; Nothing: brak powiadomień.
Narration: Jest też osobny kanał Botysław Smith przypomnienia. Bot przypomina tam codziennie o dwudziestej oraz po resecie tygodnia. Jeśli nie chcesz powiadomień, kliknij nazwę tego kanału prawym przyciskiem myszy. Otwórz ustawienia powiadomień, tutaj Notification Settings, i wybierz Nothing, czyli nic.

### 13. Wyciszenie kanału: Wybierz czas wyciszenia
Visual: 10-mute.png; crop [224, 569, 596, 786].
On-screen: Prawy przycisk na kanale.; Mute Channel: wycisz kanał.; Wybierz czas lub do odwołania.; Wiadomości nadal możesz czytać.
Narration: Możesz też wyciszyć sam kanał. W tym samym menu rozwiń Mute Channel, czyli wycisz kanał. Wybierz czas, na przykład godzinę albo do momentu ponownego włączenia. Aby cofnąć wyciszenie, wróć do tego menu i wybierz Unmute Channel. Wiadomości nadal są dostępne do przeczytania.

### 14. Wracaj do przycisków: Dane aktualne, raport czytelny
Visual: 05-player-bottom.png; crop [447, 550, 727, 748].
On-screen: Czytaj pominięte akcje.; Po wydaniu zasobów: /update.; Przyciski ułatwiają nawigację.; Do menu wrócisz przez /start.
Narration: Raporty wskazują akcje, których nie prognozujemy. Po wydaniu zasobów aktualizuj ich stan. Do prywatnego menu wrócisz przyciskiem Start pod wiadomością powitalną na kanale bota. Korzystaj z przycisków, żeby szybko przechodzić między danymi i raportami.


## Repository boundary
Keep this production guide and the Python builders in Git. Screenshots, dated editions, scene JSON for real captures, voice caches, clips and rendered videos stay local and are ignored. Existing local artifact paths are preserved so previous video links and reproduction commands continue to work. Do not add real player captures or hosting screenshots to a public repository.
