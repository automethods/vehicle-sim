const ukrainian = new Map(`
Language|Мова
CoC comparisons|Порівняння з CoC
CoC top speed|Максимальна швидкість за CoC
CoC electric range|Запас ходу за CoC
Other tests|Інші випробування
Additional drive cycle|Додатковий їздовий цикл
Select a drive cycle|Оберіть їздовий цикл
Simulated result|Результат симуляції
Published CoC|Опубліковане значення CoC
Full throttle for 90 s with level-road load, including air resistance. The result is the average over the final kilometre if the speed stays steady.|Повна тяга впродовж 90 с з опором рівної дороги та повітря. Результат — середня швидкість на останньому кілометрі за умови сталого руху.
Road-load power|Потужність опору руху
Repeats the full WLTC Class 3b from 100% charge to a 1% simulated reserve. The result is the distance travelled.|Повторює повний цикл WLTC класу 3b від 100 % заряду до модельного резерву 1 %. Результат — пройдена відстань.
Test stopped by a high-voltage fault.|Випробування зупинено через несправність високовольтної системи.
The final kilometre did not meet the steady-speed criterion.|На останньому кілометрі швидкість не відповідала критерію стабільності.
The simulated time limit was reached before the battery reserve.|Межі часу симуляції досягнуто раніше, ніж мінімального рівня заряду.
Reset view|Скинути ракурс
Drag to orbit. Shift-drag or right-drag to pan. Scroll to zoom.|Перетягуйте для обертання. Shift або права кнопка миші — для панорамування. Коліщатко — для масштабування.
CHASSIS DYNAMOMETER|РОЛИКОВИЙ СТЕНД
Longitudinal vehicle model|Модель поздовжнього руху
FORCE BALANCE|БАЛАНС СИЛ
COASTDOWN ROAD LOAD|ОПІР РУХУ ЗА ВИБІГОМ
ROAD GRADE|УХИЛ ДОРОГИ
DC PACK POWER|ПОТУЖНІСТЬ БАТАРЕЇ
NET PACK CONSUMPTION|ЧИСТІ ВИТРАТИ ЕНЕРГІЇ
Effective mass, kg|Зведена маса, кг
Speed, m/s|Швидкість, м/с
Time, s|Час, с
Motor force, N|Сила двигуна, Н
Friction brake force, N|Сила фрикційного гальмування, Н
Motor force is negative during regeneration.|Під час рекуперації сила двигуна від’ємна.
Road-load force, N|Сила опору руху, Н
Constant coefficient, N|Сталий коефіцієнт, Н
Linear coefficient, N·s/m|Лінійний коефіцієнт, Н·с/м
Quadratic coefficient, N·s²/m²|Квадратичний коефіцієнт, Н·с²/м²
Grade force, N|Сила від ухилу, Н
Vehicle mass, kg|Маса автомобіля, кг
Gravitational acceleration, m/s²|Прискорення вільного падіння, м/с²
Road angle, rad|Кут нахилу дороги, рад
Net pack power, W|Чиста потужність батареї, Вт
Terminal voltage, V|Напруга на клемах, В
Pack current, A|Струм батареї, А
Consumption, kWh/100 km|Витрати енергії, кВт·год/100 км
Discharged and returned energy, kWh|Віддана й повернена енергія, кВт·год
Distance, km|Відстань, км
Actual readout|Факт
Target readout|Задано
Volodymyr Oleksandrovych Lomakin|Ломакін Володимир Олександрович
Serhii Volodymyrovych Melnychuk|Мельничук Сергій Володимирович
© 2026 Project authors.|© 2026 Автори проєкту.
About the project|Про проєкт
Founder|Засновник
Lomakin V. O.|Ломакін В. О.
, PhD in Engineering|, к. т. н.
Contributors|Учасники розробки
Melnychuk S. V.|Мельничук С. В.
, PhD in Engineering, Associate Professor|, к. т. н., доц.
, Doctor of Technical Sciences, Associate Professor|, д. т. н., доц.
AI assistance with writing, translation, programming and verification (GPT-6 family).|Допомога ШІ з підготовкою текстів, перекладом, програмуванням і перевіркою (моделі родини GPT-6).
Vehicle datasheet|Технічні дані автомобіля
Connecting|Підключення
Plant connected|Модель підключено
Plant unavailable|Модель недоступна
Vehicle testing on a roller dynamometer|Випробування автомобіля на стенді з біговими барабанами
Vehicle|Автомобіль
Roller tests|Випробування на роликах
Service brake test|Випробування робочих гальм
Coastdown test|Випробування вибігом
Reduced braking force (50%)|Знижена гальмівна сила (50 %)
Starts at 50 km/h on level ground and applies the friction brakes in neutral until the vehicle stops.|Від 50 км/год на рівній дорозі в нейтральному режимі застосовуються фрикційні гальма до повної зупинки.
Coasts from 100 to 20 km/h in neutral on level ground. Road load slows the vehicle.|Вибіг від 100 до 20 км/год у нейтральному режимі на рівній дорозі. Автомобіль сповільнюється під дією опору руху.
Braking distance|Гальмівний шлях
Coastdown distance|Шлях вибігу
Mean deceleration|Середнє сповільнення
Elapsed time|Тривалість
Charging current|Струм заряджання
Check high-voltage system|Перевірте високовольтну систему
Simulated diagnostic trouble code|Змодельований діагностичний код несправності
High-voltage interlock circuit|Коло блокування високовольтної системи
Traction and charging are disabled. Reset the simulation to clear the fault.|Тягу й заряджання вимкнено. Щоб скинути несправність, перезапустіть симуляцію.
Fault|Несправність
m/s²|м/с²
m|м
RWD|Задній привод
Playback|Темп симуляції
Playback speed|Темп симуляції
Reset|Скинути
Run test|Почати випробування
Complete|Завершено
Pause|Пауза
Running|Виконується
Paused|Призупинено
Ready|Готово
Dynamometer views|Види стенда
Live view|Режим перегляду
Test cell|Випробувальна камера
Driver|Водій
Control room|Операторська
Three-dimensional vehicle dynamometer test cell|Тривимірна випробувальна камера роликового стенда
Camera views|Ракурси камери
Driver eye|Погляд водія
Side|Збоку
Top|Зверху
Model wall|Стіна з формулами
Battery|Батарея
Rollers|Ролики
Wheels 0 rpm|Колеса 0 об/хв
Drums 0 rpm|Ролики 0 об/хв
Rear wheels|Задні колеса
All wheels|Усі колеса
Rear drums|Задні ролики
Synced drums|Синхронізовані ролики
rpm|об/хв
Drive-cycle guide|Графік для водія
Driver seat|Місце водія
Full guide|Розгорнути графік
Cabin view|Вид із салону
View through the Tesla windshield|Вид через лобове скло Tesla
Cabin view requires WebGL 2.|Для виду із салону потрібен WebGL 2.
Loading the drive-cycle guide…|Завантаження їздового циклу…
Drive cycle|Їздовий цикл
Target · km/h|Задана швидкість · км/год
Actual · km/h|Фактична швидкість · км/год
Error · km/h|Відхилення · км/год
Guidance|Підказка
Driver guide with speed across the screen and upcoming time above the current position|Швидкість на горизонтальній осі, наступні секунди над поточною позначкою
Target|Задана швидкість
Actual|Фактична швидкість
Upper and lower limits · ±2 km/h|Верхня й нижня межі · ±2 км/год
Current speed|Поточна швидкість
Low|Низька
Medium|Середня
High|Висока
Extra high|Дуже висока
Extra-high|Дуже висока
30:00 remaining|Залишилось 30:00
remaining|залишилось
Cycle phases|Фази циклу
Cycle progress|Перебіг циклу
Cycle complete|Цикл завершено
Awaiting plant|Очікування моделі
Cell camera|Камера стенда
Rear quarter|Вид ззаду збоку
Live cell camera|Зображення з камери стенда
3D camera unavailable|Камера 3D недоступна
Cell setpoint|Температура в камері
Pack temperature|Температура батареї
Climate|Клімат
Test cell climate|Клімат випробувальної камери
Air temperature|Температура повітря
Relative humidity|Відносна вологість
Air pressure|Тиск повітря
These values describe the simulated chamber.|Ці значення описують змодельовані умови у випробувальній камері.
Thermometer|Термометр
Hygrometer|Гігрометр
Barometer|Барометр
kPa|кПа
N·m|Н·м
N|Н
V|В
A|А
OBD-II and EV diagnostics|Діагностика OBD-II та електромобіля
Vehicle speed uses a virtual OBD-II reply. The remaining signals come from the EV model.|Швидкість автомобіля зчитується з віртуальної відповіді OBD-II. Інші сигнали надходять з моделі електромобіля.
Speed request|Запит швидкості
Simulated reply|Змодельована відповідь
(service 1, PID 13 in decimal)|(сервіс 1, PID 13 у десятковій системі)
The bytes are hexadecimal. The last reply byte gives speed in km/h.|Байти записано в шістнадцятковій системі. Останній байт відповіді містить швидкість у км/год.
Signal|Сигнал
Live value|Поточне значення
Export|Експорт
Include selected signals and plots in PDF|Додати вибрані сигнали й графіки до PDF
Published specifications include values from the vehicle’s Certificate of Conformity (CoC)|В опублікованих характеристиках наведено дані із сертифіката відповідності автомобіля (CoC)
Export diagnostics CSV|Експорт діагностики в CSV
Run the experiment before exporting diagnostics.|Запустіть випробування перед експортом діагностики.
Select supported diagnostic signals.|Виберіть підтримувані діагностичні сигнали.
High voltage|Висока напруга
Driver monitor|Монітор водія
Select a drive cycle to show its live guide.|Оберіть їздовий цикл, щоб побачити графік для водія.
Live driver speed guide|Графік заданої швидкості для водія
Red target · amber limits · green current speed|Червона лінія — завдання, жовті — межі, зелена — поточна швидкість
Test monitor|Параметри випробування
Actual speed|Фактична швидкість
Target speed|Задана швидкість
Drum speed|Частота обертання роликів
Road-load power|Потужність опору руху
Distance|Відстань
Pack charge|Заряд батареї
WLTP partial cycles|Неповні цикли WLTP
Cycle overview|Огляд циклу
Select a drive cycle for the overview.|Оберіть їздовий цикл для перегляду.
Entire cycle target with a marker for current test time|Задана швидкість усього циклу з позначкою поточного часу
Test setup|Налаштування випробування
Experiment|Випробування
Manual driving|Ручне керування
DC charging|Заряджання постійним струмом
Control the pedals while the simulation drives the rollers.|Керуйте педалями, поки модель обертає ролики.
Cycle driver|Керування їздовим циклом
Automatic|Автоматичне
Manual pedals|Ручне керування педалями
Roller setup|Налаштування роликів
3D roller and wheel animation|Анімація роликів і коліс у 3D
Rear axle only · RWD|Лише задня вісь · задній привод
Four-wheel synchronized bench|Синхронізований стенд для чотирьох коліс
Initial SOC · %|Початковий заряд · %
Pack temp · °C|Температура батареї · °C
Accelerate|Розгін
Brake|Гальмування
Full brake|Повне гальмування
Accelerator|Педаль акселератора
Friction brake|Фрикційне гальмо
Inject HV fault|Імітувати несправність високовольтної системи
Simulated time|Час симуляції
Live measurements|Поточні показники
Vehicle speed|Швидкість автомобіля
Battery power|Потужність батареї
Battery charge|Заряд батареї
Net pack consumption|Чисті витрати енергії батареї
Wh/km|Вт·год/км
kWh/100 km|кВт·год/100 км
km/h|км/год
kWh|кВт·год
kW|кВт
km|км
s|с
Run traces|Графіки випробування
Export CSV|Завантажити CSV
PDF report|Звіт PDF
Sign in on AutoMethods|Увійдіть на АвтоМетоді
to download results.|для завантаження результатів.
Trace signal|Величина на графіку
Pack power|Потужність батареї
Simulated|Симуляція
Cycle target|Задана швидкість циклу
Driver limits · ±2 km/h|Межі для водія · ±2 км/год
TUM reference|Еталонні вимірювання TUM
Vehicle speed versus simulation time|Швидкість автомобіля за часом симуляції
Battery terminal power versus simulation time|Потужність на клемах батареї за часом симуляції
Live signals|Поточні сигнали
HV state|Стан високовольтної системи
Pack voltage|Напруга батареї
Pack current|Струм батареї
Available charge power|Доступна потужність заряджання
Motor torque|Крутний момент двигуна
Cycle road grade|Ухил дороги в циклі
Regenerated into pack|Енергія рекуперації
Charging source|Джерело заряджання
Heat into pack|Тепловий потік до батареї
Test complete|Випробування завершено
Test ended|Випробування припинено
Review the run and its references in the test report.|Результати випробування й джерела наведено у звіті.
Download test report (PDF)|Завантажити звіт (PDF)
Sign in to download the report|Увійти для завантаження звіту
References|Список джерел
3D model credit and license|Авторство й ліцензія 3D-моделі
Educational institution|Заклад освіти
Zhytomyr Agrotechnical Professional College|Житомирський агротехнічний фаховий коледж
Department of Automotive Transport|Кафедра «Автомобільний транспорт»
Polissia National University|Поліський національний університет
Department of Agricultural Engineering and Technical Service|Кафедра агроінженерії та технічного сервісу
Ilchenko A. V.|Ільченко А. В.
(ZHAPC)|(ЖАТФК)
(PNU)|(ПНУ)
Ilchenko Andrii Volodymyrovych|Ільченко Андрій Володимирович
Close|Закрити
Late 2020 · LFP battery · rear-wheel drive · TUM test vehicle|Кінець 2020 року · батарея LFP · задній привод · випробувальний автомобіль TUM
Body length × width × height|Довжина × ширина × висота кузова
Wheelbase / track|Колісна база / колія
Tires|Шини
Nominal pack energy|Номінальна енергія батареї
CoC actual mass|Фактична маса за CoC
Peak / 30-minute motor power|Пікова / 30-хвилинна потужність двигуна
CoC top speed|Максимальна швидкість за CoC
CoC WLTP range|Запас ходу WLTP за CoC
Reading energy consumption|Як читати витрати енергії
The simulator reports DC energy at the pack terminals. Discharge minus regeneration, divided by distance, gives net pack consumption.|Симулятор визначає енергію постійного струму на клемах батареї. Чисті витрати енергії — різниця енергії розряду й рекуперації, поділена на пройдену відстань.
1 kWh/100 km = 10 Wh/km.|1 кВт·год/100 км = 10 Вт·год/км.
The live value appears after 10 m and can be negative on a downhill run.|Показник з’являється після 10 м і може бути від’ємним на спуску.
WLTP reports electric energy consumption in Wh/km|Витрати електроенергії за WLTP подають у Вт·год/км
. The 2020 U.S. SR+ label gives|. На етикетці SR+ 2020 року для США зазначено
24 kWh/100 mi|24 кВт·год/100 миль
(about|(близько
14.9 kWh/100 km|14,9 кВт·год/100 км
. The U.S. procedure includes AC recharge energy|. Методика США враховує енергію заряджання від мережі змінного струму
The run follows the standard Class 3b cycle for this electric vehicle under WLTP (Worldwide Harmonized Light Vehicles Test Procedure). The run traces show the TUM reference pass with a 9 s recording offset.|Випробування відтворює стандартний цикл класу 3b для цього електромобіля за WLTP (всесвітня гармонізована процедура випробувань легких транспортних засобів). На графіках наведено еталонний заїзд TUM зі зміщенням запису на 9 с.
The parked car charges from a 150 kW DC source up to 80% SOC. A cold pack requests motor heat.|Нерухомий автомобіль заряджається від джерела постійного струму 150 кВт до 80 %. Холодна батарея потребує підігріву від двигуна.
Follow the target on the Driver display with the pedals below.|Підтримуйте задану швидкість за графіком водія за допомогою педалей.
The automatic driver follows the selected speed schedule.|Автоматичний водій відтворює заданий графік швидкості.
Enter SOC from 0 to 100% and temperature from −50 to 80 °C.|Укажіть заряд від 0 до 100 % і температуру від −50 до 80 °C.
The 3D view requires WebGL 2. Test controls and measurements are available below.|Для виду 3D потрібен WebGL 2. Керування й показники випробування доступні нижче.
Measured pack mesh unavailable. Showing the schematic.|Виміряна модель батареї недоступна. Показано схему.
Loading Tesla Model 3…|Завантаження Tesla Model 3…
Tesla Model 3 could not load.|Не вдалося завантажити Tesla Model 3.
Target speed RMSE|СКП заданої швидкості
TUM speed RMSE|СКП швидкості відносно TUM
TUM pack power RMSE|СКП потужності відносно TUM
TUM pack consumption|Витрати батареї TUM
Pack net|Чиста енергія батареї
simulated / TUM|симуляція / TUM
Energy into pack|Енергія до батареї
Speed up|Прискоріться
Ease off|Зменште швидкість
On target|У межах допуску
Speed (km/h)|Швидкість (км/год)
NOW|ЗАРАЗ
References unavailable.|Список джерел недоступний.
`.trim().split("\n").map((line) => {
  const separator = line.indexOf("|");
  return [line.slice(0, separator), line.slice(separator + 1)];
}));

export type Language = "en" | "uk";

export function setupLanguage(onChange: (language: Language) => void) {
  const textNodes: [Text, string][] = [];
  const stateful = ".system, .scene-footer, #run, #experiment-note, #show-guide, #driver-phase, #driver-state, #driver-cue, #driver-remaining, #operator-status";
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const original = node.nodeValue ?? "";
    if (ukrainian.has(original.trim()) && !node.parentElement?.closest(stateful)) textNodes.push([node as Text, original]);
  }
  const attributes = [...document.querySelectorAll("[aria-label], [title], optgroup[label]")].flatMap((node) =>
    ["aria-label", "title", "label"].flatMap((name) => {
      const value = node.getAttribute(name);
      return value && ukrainian.has(value) ? [{ node, name, value }] : [];
    }));
  const buttons = [...document.querySelectorAll<HTMLButtonElement>("button[data-language]")];
  const shared = (globalThis as typeof globalThis & { AutoMethodsLanguage?: { language: Language } }).AutoMethodsLanguage;
  let saved: string | null = null;
  try { saved = localStorage.getItem("vehicle-sim-language"); } catch {}
  let current: Language = shared?.language ?? (saved === "en" || saved === "uk" ? saved
    : navigator.languages.some((tag) => /^uk(?:-|$)|(?:^|-)UA(?:-|$)/i.test(tag)) ? "uk" : "en");
  const translate = (value: string) => current === "uk" ? ukrainian.get(value) ?? value
    : value === "Actual readout" ? "Actual" : value === "Target readout" ? "Target" : value;
  const apply = () => {
    document.documentElement.lang = current;
    if (shared) document.documentElement.dataset.language = current;
    document.title = translate("Vehicle testing on a roller dynamometer");
    for (const [node, original] of textNodes) node.nodeValue = original.replace(original.trim(), translate(original.trim()));
    for (const { node, name, value } of attributes) node.setAttribute(name, translate(value));
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.language === current));
  };
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted || !shared || current === shared.language) return;
    current = shared.language;
    apply();
    onChange(current);
  });
  for (const button of buttons) button.addEventListener("click", () => {
    current = button.dataset.language === "uk" ? "uk" : "en";
    if (!shared) {
      try { localStorage.setItem("vehicle-sim-language", current); } catch {}
    }
    apply();
    onChange(current);
  });
  apply();
  return { translate, language: current };
}
