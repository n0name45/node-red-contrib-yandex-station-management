## Описание
С помощью модуля можно через локальное API управлять вопсроизведением на устройсвах Яндекса:
- Яндекс Станция(протестировано)
- Яндекс Станция мини(протестировано)
- Яндекс Станци Макс(протестировано)
- Яндекс Модуль(не протестировано)
- JBL Link Music(не протестировано)
- JBL Link Portable(протестировано)


Работа возможна только с устройствами, которые одновременно:
- подключены к учетной записи Яндекса
- находятся в одной локальной сети с сервером Node-Red


Для работы требуется токен от Яндекс.Музыки. 
В модуле в экспериментальном режиме реализована возможность получения токена из логин-пароля(Спасибо слать [сюда](https://github.com/twocolors)). Если получение токена не отрабатывает, то стоит попробовать включить и отключить двух-факторную аутентификацию в настройках Яндекса. [Источник](https://github.com/AlexxIT/YandexStation/issues/103). Убедиться в безопасности использования учетных данных можно посмотрев [код](./nodes/yandex-login.html)

Второй из варинатов его получения описан в [FAQ](#faq)

Возможна работа с несколькими устройствами(протестировано) и несколькими учетными записями(протестировано).

Состоит из 4 нод, позволяющих гибко настраивать автоматизации и использовать голосовые уведомления:
- IN нода для автоматичесукого получения данных о статусе колонки
- GET нода для получения данных о статусе устройства по запросу.
- OUT нода для отправки команд станции
- Station нода для дополнительных настроек


## Установка.
Установка проводится через раздел Manage Palette в Node-Red или при помощи npm.
в каталоге с Node-Red (обычно `~/.node-red`) выполнить команду:

    npm i node-red-contrib-yandex-station-management

## Первоначальная настройка.
После установки для начала работы добавить любую ноду, ввести учетные данные(токен) в раздел Login, сохранить и нажать Deploy(обязательно!). Как получить токен - написано в FAQ.

После деплоя в настройках ноды в поле Station должны появиться станции доступные для управления. Если станция не появилась в списке, то можно подождать пару минут или перезапустить Node-Red.

## Описание возможностей и сценариев использования.
### Нода Station
Дополнительные настройки для станции. Является опциональной, то есть все будет работать и без этой ноды, но с ней может быть интерсней. Нода ставится вне потока и не имеет входов и выходов.
#### Connection to device
Управление подключением к станции. Если по каким-то причинам надо, чтобы подключение не производилось - выставить в Disabled.
#### Network
В состоянии Manual появляется возможность вручную указать адрес станции и порт для подключения. Рекомендуется, если используются docker-ы, HomeAssistant-ы, и прочие случаи, при которых не отрабатывает автоматические определение сетевых реквизитов для подключения.
#### Kid Control
Реализована возможность ограничения по времени для прослушивания песен, радио, сказок, чтобы маленькие любители ночных историй поскорее засыпали. Настраивается для каждого дня недели. Если не стоит галка Active, то для этого дня ограничения не работают.
Phrase to say - фраза, которую скажет Алиса вместо музыки:) При этом работают навыки, будильники, погода, новости и так далее.

### Нода IN.
Ставится на старте flow и автоматически отправляет данные о текущем статусе колонки в "сыром" формате и Homekit.
#### Full status Message("сырой" формат)
Выдает данные без преобразования, то есть в том виде, в каком они получены от устройсва. Структура сообщения:
```json
    {"aliceState":"IDLE",
    "canStop":false,
    "hdmi":
        {"capable":true,
        "present":false},
    "playerState":
        {"duration":180.91,
        "extra":
            {"coverURI":"avatars.yandex.net/get-music-content/2383988/de45408f.a.9039208-1/%%",
            "stateType":"music"},
        "hasNext":true,
        "hasPause":false,
        "hasPlay":false,
        "hasPrev":true,
        "hasProgressBar":true,
        "liveStreamText":"",
        "progress":20,
        "showPlayer":true,
        "subtitle":"Крематорий",
        "title":"Мусорный ветер"},
        "playing":false,
        "timeSinceLastVoiceActivity":30454,
        "volume":0}
```
Сообщения от устройства могут приходить по несколько штук в секунду, поэтому стоит подумать о необходимости поставить штатную ноду RBE, чтобы фильтровать дубликаты по контенту(название трека(payload.playerState.title), имя исполнителя(payload.playerState.subtitle)).

#### HomeKit formatted
Внутри выполняется преобразование выдаваемого формата под homekit и ноду можно стыковать прямо с homekit-нодой, в результате чего значиьельно упрощается flow. Юзкейсы можно найти в конце документации.

Для homekit formatted выдачи имеются опции:
 - Unique messages. Отправляются только уникальные сообщения, без дубликатов.
 - Homekit format. Выбор вывода под разные устройства - Smart Speaker и Television. В примерах использования описаны сценарии.

Структура  сообщения Homekit formatted - Smart Speaker:
```json
{"CurrentMediaState":0,"ConfiguredName":"International String Trio - Tarantella"}
```
Структура  сообщения Homekit formatted - Television:
```json
{"Active":1}
```
При использовании устройства Television появляется возможность использования "пульта" на iOS.
### Нода GET.
Ставится в середине flow и при любом входящем сообщении отправляет на выход в payload последний статус устройства. Структура выдачи аналогична Full status Message ноды IN.

### Нода OUT.
Ставится в конце flow и используется для отправки сообщений на устройства. Допускается использование нескольких нод OUT для одного и того же устройства, при этом данные будут от них передаваться через одно соединение с устройством.

#### Player command.
Управление воспроизведением колонки. Нода ждет, что в payload строкой придет одна из следующих команд: play, stop, next, prev, forward(вперед на 10 секунд), backward(назад на 10 секунд), volumeup, volumedown

#### Voice command.
Отправка команды, вместо того, чтобы говорить ее колонке голосом: "Включи свет", "Включи музыку", "Включи мой плейлист", "Отключись через 15 минут" и так далее.

#### TTS.
Воспросизведение голосом отправленных фраз - Text to Speech. Не имеет ограничения по символам. Есть ряд опций:
- Fixed volume level. Позволяет произносить фразу заданной громкостью. Если не выбрано, то фраза произносится с текущим уровнем громкости. После произнесения уровень громкости вернется в изначальный.
- Prevent listening. Если выбрано, то колонка после воспроизведения не "слушает", что ей ответят.
- Pause while TTS. Ставит воспроизведение плеера на паузу на время речи. Воспроизведение будет продолжено, только если что-то играло на момент поступления команды.
Все опции комбинируемы между собой.

Работают голосовые [спецэффекты](https://yandex.ru/dev/dialogs/alice/doc/speech-effects-docpage/),[дополнительные голоса](https://yandex.ru/dev/dialogs/alice/doc/speech-effects-docpage/) и [звуки](https://yandex.ru/dev/dialogs/alice/doc/sounds-docpage/), при этом отправка производится в ввиде строки. Например, "смелость sil <[500]> город+а берёт"


#### Homekit Formatted.
Ловит вывод от Homekit от устройств SmartSpeaker(вкл/выкл) и Television(вкл/выкл + пульт) модуля [NRCHB](https://github.com/NRCHKB/node-red-contrib-homekit-bridged).
Встроена функция проверки hap.context,предотвращающая зацикливание.
Стыкуется напрямую с Homekit нодой.
Опция "Default command" указывает, какую голосовую команду запустить, если нет текущего трека для старта воспроизведения, а играть что-то надо. Например, "Включи мою музыку" или "Включи детские песни".

#### RAW Command.
Получает сообщение в формате JSON внутри payload и передает его колонке без обработки. Возможна отправка нескольких сообщений в одном сообщении payload в виде массива.
Известные команды:
1. Перемотка на позицию в секундах
```json
{
    "command": "rewind",
    "position" : 120
}
```
2. Продолжить воспроизведение
```json
{
    "command": "play"
}
```
3. Остановка вопроизведения
```json
{
    "command": "stop"
}
```
4. Предыдущий трек
```json
{
    "command": "prev"
}
```
5. Следующий трек
```json
{
    "command": "next"
}
```
6. Включить исполнителя по ID

```json
{
    "command": "playMusic",
    "id": "2",
    "type":"artist"
}
```
7. Включить трек по ID
```json
{
    "command": "playMusic",
    "id": "44731403",
    "type": "track"
}
```
8. Включить плейлист по ID
```json
{
    "command": "playMusic",
    "id": "44731403:1234556",
    "type": "playlist"
}
```
9. Установка громкости в диапазоне 0-1
```json
{
	"command" : "setVolume",
	"volume" : 0.2
}
```
10. Отправить "Текст" для TTS.
```json
{
	"command" : "sendText",
	"text" : "Повторяй за мной 'Текст'"
}
```
11. Отправить голосовую команду.
```json
{
	"command" : "sendText",
	"text" : "Включи музыку"
}
```
12.  Прервать "слушание" после TTS и не только:
```json
{
    "command": "serverAction",
    "serverActionEventPayload": {
        "type": "server_action",
        "name": "on_suggest"
    }
}
```

13.  Отправить "Текст" для TTS со спецэффектами (**raw режим**):
```json
{
    "command": "serverAction",
    "serverActionEventPayload": {
        "type": "server_action",
        "name": "update_form",
        "payload": {
            "form_update": {
                "name": "personal_assistant.scenarios.repeat_after_me",
                "slots": [
                    {
                        "type": "string",
                        "name": "request",
                        "value": "<speaker effect='megaphone'>Ехал Грека через реку <speaker effect='-'>видит Грека в реке рак"
                    }
                ]
            },
            "resubmit": true
        }
    }
}
```

- [Изменение голоса](https://cloud.yandex.com/en-ru/docs/speechkit/tts/voices)
```json
"value": "<speaker voice='kostya'>смелость sil <[500]> город+а берёт"
```
Поддерживаемые голоса: jane, oksana, omazh, zahar, ermil, levitan, ermilov, silaerkan, kolya, kostya, nastya, sasha, nick, erkanyavas, zhenya, tanya, anton_samokhvalov, tatyana_abramova, voicesearch, ermil_with_tuning, robot, dude, zombie, smoky, alyss, nick. (Список взят [тут](https://github.com/tayanov/Yandex-tts-speechkit-FIX/blob/master/custom_components/yandextts/tts.py))

- [Настройка генерации речи](https://yandex.ru/dev/dialogs/alice/doc/speech-tuning-docpage/)
```json
"value": "смелость sil <[500]> город+а берёт"
```

- [Наложение эффектов на голос](https://yandex.ru/dev/dialogs/alice/doc/speech-effects-docpage/)
```json
"value": "<speaker effect='megaphone'>Ехал Грека через реку <speaker effect='-'>видит Грека в реке рак"
```

- [Библиотека звуков](https://yandex.ru/dev/dialogs/alice/doc/sounds-docpage/)
```json
"value": "<speaker audio='alice-sounds-game-win-1.opus'>У вас получилось!"
```

- Совмещение эффектов
```json
"value": "<speaker voice='kostya' audio='alice-sounds-game-win-1.opus' effect='megaphone'>добро пожаловать"
```


#### Stop listening.

Принудительное прерывания "слушания" Алисы при любом входящем в ноду сообщении. Аналогично 12 команде предыдущего раздела

#### Пример использования нескольких RAW команд

Остановить проигрывание музыки и сказать текст громкостью 0.8

```json
[
    {"command":"stop"},
    {
        "command": "serverAction",
        "serverActionEventPayload": {
            "type": "server_action",
            "name": "on_suggest"
        }
    },
    {"command":"setVolume","volume":0.8},
    {
        "command": "serverAction",
        "serverActionEventPayload": {
            "type": "server_action",
            "name": "update_form",
            "payload": {
                "form_update": {
                    "name": "personal_assistant.scenarios.repeat_after_me",
                    "slots": [
                        {
                            "type": "string",
                            "name": "request",
                            "value": "<speaker effect='megaphone'>Ехал Грека через реку <speaker effect='-'>видит Грека в реке рак"
                        }
                    ]
                },
                "resubmit": true
            }
        }
    }
]
```

## Примеры использования.

### Управление воспроизведением устройства.
Есть ряд способов управлением воспроизведения музыки на колонках.
1. Из Node-Red. В ноду OUT в режиме Player Command надо отправлять в виде строки одну из команд: play, stop, next, prev, forward, backward. Примеры идут вместе с плагином!
![alt text](/readme_images/simpleControl.png "simple player")
2. Из [ui-dashboard](https://flows.nodered.org/node/node-red-dashboard). Благодарю участников сообщества [Node-Red на sprut.ai](https://t.me/SprutAI_NodeRED) за подгтовку примеров. Если плагин с [дашбордом](https://flows.nodered.org/node/node-red-dashboard) не стоит, его надо поставить.
После этого имортировать пример из ноды и по адресу /ui найдутся элементы управления.

![alt text](/readme_images/dashboardPlayer.png "player")
![alt text](/readme_images/dashboardPlayerFlow.png "player")

Есть еще один вариант от сообщества, который надо самостоятельно импортировать [со страницы автора](https://github.com/twocolors/node-red-dashboard-template/blob/main/alice_v2.json)

Добавляется простым flow и выглядит отлично)

![alt text](/readme_images/dashboardTemplate.png "player")
![alt text](/readme_images/dashboardTemplateFlow.png "player")

3. Из Homekit. Ноды IN и GET имеют возможность выдачи сообщений в готовом для Homekit формате.
Можно самостоятельно подготовить сообщение к отправке в Homekit, а можно просто воспользоваться нужной настройкой внутри нод. Разумным будет установка галки Unique messages для IN-ноды, чтобы не заваливать Homekit одинаковыми сообщениями.

В списке устройств [NRCHB](https://github.com/NRCHKB/node-red-contrib-homekit-bridged) есть Smart Speaker. Из коробки с помощью простого flow можно управлять состоянием вкл-выкл воспроизведения и видеть название трека. Работает только на iOS 14 или macOS Big Sur. Элементы управления внутри Homekit **не работают**, их еще не завезли Homekit-ноду.

Если требуется работать на старых версиях iOS/macOS или надо управлять воспроизведением со штатного инструмента Пульт из панели управления, то можно собрать flow на базе homekit-нод TV, ноды IN в соотвествующем формате и OUT. При этом OUT-нода в Homekit-формате умеет "понимать" вход от SmartSpeaker, Television и обоих вместе. Проверка сообщений на зацикливание встроена в ноду OUT.
![alt text](/readme_images/homekitPlayer.png "player")
![alt text](/readme_images/iosRemote.jpeg "player")

## FAQ.

**Q:Как получить oAuth-токен?**

A:Как один из вариантов - https://music-yandex-bot.ru
- Ввести свой логини и пароль
- Появится кнопка "Перейти в бота", ее не нажимать, а скопировать ссылку
- Внутри ссылки все буквы-цифры после &start= и есть токен

**Q:Как получить обложку трека?**

A: Ссылку на обложку Яндекс Музыки можно взять из статусного сообщения: payload.playerState.extra.coverURI

В начало добавить https:// а в конце вместо %% размер обложки, например 600x600.
https://avatars.yandex.net/get-music-content/2383988/de45408f.a.9039208-1/600x600

**Q:Как узнать ИД станции? Это может понадобиться,чтобы отличать станции, если их не одна.**

A:Приложение Яндекс на телефоне - Устройства - Управление устройствами - Выбрать станцию - Дополнительная информация

**Q:Почему название трека в Homekit меняется не сразу после переключения?**

A: Это нормально, так как для отображния используется имя устройства, а изменения имен в Homekit отражаются, так как имеют наименьший приоритете перед статусами и состояниями.

**Q: Элементы управления внутри Homekit "засерены" и не работают**

A: Если используется тип устройства Smart Speaker, то да, там они не работают и я не нашел как сделать их активными. Если у кого-то получится их сделать активными, то создание issue поможет остальным.
Сейчас альтернатива - это устройство ТВ и привязка к нему пульта. Получаетя как AppleTV. Пример есть внутри [NRCHB](https://github.com/NRCHKB/node-red-contrib-homekit-bridged)

**Q: После запуска Node-Red не видны устройство/устройства.**

A: Такое случается, если устройсвта не найдены в сети. Стоит понимать, что протокол zeroconf, который используется для поиска выдает не стабильный результат. Один поиск из 5 заканчивается отсуствием найденных устройств.
Как решение - просто подождать пару минут и повторный поиск найдет всех пропавших с радаров

**Q: Как добавить пример из ноды?**

A: В меню Node-Red есть пункт Import, а в нем раздел Examples. Внутри папки с названием плагина найдутся все примеры.

Команды для управления станции взяты [тут](https://documenter.getpostman.com/view/525400/SWLfd8et?version=latest#37dc6369-9a03-4ea2-a678-c8770f21b6cb). Спасибо автору.

## ENG
## Node-Red integration with Yandex Devices through websocket:
    - Yandex Station(tested)
    - Yandex Mini(tested)
    - Yandex Station Max(tested)
    - Yandex Module(not tested)
    - JBL Link Music(not tested)
    - JBL Link Portable(tested)

## Installation
    Run the following command in your Node-RED user directory - typically `~/.node-red`

    npm i node-red-contrib-yandex-station-management

You need Yandex music token to work propertly.
