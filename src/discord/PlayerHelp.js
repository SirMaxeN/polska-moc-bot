import { Navigation } from './Navigation.js';

export class PlayerHelp {
  static panel(userId) {
    return { embeds: [{ title: '❓ Jak korzystać z bota?', description:
      '**🏠 Zacznij od /start**\nTo główna komenda: otwiera prywatne menu z przyciskami do wpisania danych, kosztów i wszystkich raportów.\n\n'
      + '**✏️ /update: wpisz zasoby**\nKomenda od razu otwiera formularz. Podaj bilety umiejętności, klucze wierzchowców, młotki, zwierzaki lub jajka do połączenia oraz już posiadane wierzchowce czekające na połączenie **bez 1 bazowego**. W polu **Zwierzaki lub jajka** wpisz łączną liczbę zwierzaków **bez 3 bazowych** i jajek do połączenia. Ich łączenie daje tyle samo punktów; nie licz tej samej sztuki dwa razy. Łączenie wierzchowców obejmuje posiadane sztuki oraz te, które możesz przyzwać za klucze.\n'
      + 'Format zasobów: **9550 = 9,55 = 9.55 = 9,55k = 9.55k**. Przecinek lub kropka oznacza tysiące. Puste pole zachowuje poprzednią wartość lub 0; wpisanie **0** zeruje zasób. Formularz przypomina zapisane wartości. Po wydaniu zasobów aktualizuj ich stan.\n\n'
      + '**🧮 Obliczenia we wszystkich polach zasobów i kosztów**\nMożesz wpisać zwykłą liczbę albo działanie: **3+5*3 = 18**, **(3+5)*5-2 = 38**, **(20-5)/3 = 5**. Wpisuj tylko lewą stronę, bez znaku =. Działają spacje, nawiasy i kolejność działań: najpierw mnożenie/dzielenie, potem dodawanie/odejmowanie. Wynik zasobów musi być całkowity i nieujemny; kosztów całkowity i dodatni. Dotychczasowy zapis tysięcy w zasobach działa też w działaniach: **9,55+5 = 9555**.\n\n'
      + '**🔑 /costs: koszty przywołań**\nOsobno koszt **5 umiejętności** i **1 wierzchowca**. Domyślnie **200 i 50**. Wpisuj dodatnie liczby całkowite lub działania dające taki wynik, np. **200-3*4 = 188**. Własne koszty zostają po resecie tygodniowym.\n\n'
      + '**📊 Wybierz raport**\n**/report player**: Twój potencjał na 6 dni, zasoby i punkty za akcje.\n**/report clan**: suma potencjału zapisanych graczy na każdy dzień.\n**/report clan-details**: gracze osobno, data aktualizacji i sumy klanu.\n**/report missing**: kto nie wpisał zasobów w tym tygodniu lub nie zaktualizował ich dziś; dostępny dla wszystkich.\n**/report resources**: zasoby każdego gracza, koszty, aktualizacja i sumy klanu.\n**/report clan-ultra**: punkty każdego gracza rozpisane na akcje w każdym dniu.\n'
      + 'Raporty widzisz tylko Ty. 🔴 Przekreślone dni już minęły, 🟢 to bieżący dzień z czasem do końca, ⚪ pozostałe dni. Wojna trwa od **wtorku 02:00 do poniedziałku 02:00**, czasu polskiego. Poniedziałek po 02:00 jest dniem przerwy.\n'
      + 'Każdy dzień pokazuje niezależny potencjał z tych samych zasobów: **nie sumujemy wyników dni**. Raporty wskazują pominięte akcje. Reset tygodniowy w poniedziałek o 02:00 czyści zasoby; koszty pozostają.',
    }], components: [...Navigation.update(userId), { type: 1, components: [{ type: 2, style: 2, label: 'Start', emoji: { name: '🏠' }, custom_id: `menu:${userId}:start` }] }] };
  }
}
