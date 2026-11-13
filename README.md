# NodePgAdmin

Современный веб-интерфейс для управления PostgreSQL. Написан на Node.js + Express, работает в браузере, не требует установки тяжелых клиентов.

## Возможности

- **Дашборд** — статистика БД, размер, подключения, кэш, последние запросы
- **Браузер объектов** — таблицы, представления, быстрый переход к данным
- **Работа с таблицами**:
  - Просмотр данных с пагинацией, поиском, сортировкой
  - Inline-редактирование ячеек (клик по ячейке)
  - Drag-and-drop переупорядочивание колонок (сохраняется в localStorage + на сервере)
  - Добавление/удаление строк
  - Структура: колонки, индексы, ограничения, внешние ключи
  - DDL генерация
  - Переименование таблицы (`ALTER TABLE ... RENAME TO`)
- **Представления (Views)** — просмотр данных и определения, удаление (`DROP VIEW`)
- **SQL-редактор** — выполнение произвольных запросов, история, шаблоны
- **Импорт** — CSV/JSON в таблицу
- **Темы** — тёмная/светлая (переключатель в тулбаре, запоминается)

## Быстрый старт

```bash
# 1. Клонировать
git clone https://github.com/smilepps/NodePgAdmin.git
cd NodePgAdmin

# 2. Установить зависимости
npm install

# 3. Настроить подключение к БД
cp .env.example .env
# Отредактируйте .env: укажите DB=postgresql://user:pass@host:5432/dbname

# 4. Запустить
npm start
# или
node server.js
```

Откройте **http://localhost:3000**

## Переменные окружения

| Переменная | Описание | Пример |
|------------|----------|--------|
| `DB` / `DATABASE_URL` | Строка подключения к PostgreSQL | `postgresql://user:pass@localhost:5432/mydb` |
| `PORT` | Порт сервера (по умолчанию 3000) | `3000` |

Создайте `.env` на основе `.env.example`:
```
DB=postgresql://postgres:password@localhost:5432/mydb
PORT=3000
```

## Структура проекта

```
NodePgAdmin/
├── server.js          # Основной сервер (Express + pg)
├── package.json       # Зависимости и скрипты
├── .env               # Конфигурация (не в git)
├── .gitignore
├── store.json         # Локальное хранилище (темы, порядок колонок, шаблоны, история)
├── run.bat            # Запуск на Windows
└── README.md
```

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/` | Дашборд |
| `GET` | `/browser` | Браузер объектов |
| `GET` | `/table/:table` | Данные таблицы |
| `GET` | `/table/:table/structure` | Структура таблицы |
| `GET` | `/table/:table/indexes` | Индексы |
| `GET` | `/table/:table/constraints` | Ограничения |
| `GET` | `/table/:table/foreign-keys` | Внешние ключи |
| `GET` | `/table/:table/ddl` | DDL |
| `POST` | `/table/:table/rename` | Переименовать таблицу |
| `POST` | `/table/:table/drop` | Удалить таблицу |
| `POST` | `/table/:table/add-column` | Добавить колонку |
| `POST` | `/table/:table/drop-column/:col` | Удалить колонку |
| `POST` | `/table/:table/add-index` | Создать индекс |
| `POST` | `/table/:table/drop-index/:idx` | Удалить индекс |
| `POST` | `/table/:table/add-foreign-key` | Добавить внешний ключ |
| `POST` | `/table/:table/drop-foreign-key/:name` | Удалить внешний ключ |
| `GET` | `/view/:view` | Данные представления |
| `POST` | `/view/:view/drop` | Удалить представление |
| `GET` | `/query` | SQL-редактор |
| `GET/POST` | `/import` | Импорт CSV/JSON |
| `GET` | `/create-table` | Создать таблицу |
| `PATCH` | `/api/table/:table/row/:id` | Inline-обновление строки |
| `DELETE` | `/api/table/:table/row/:id` | Удалить строку |
| `POST` | `/api/table/:table/column/:col/description` | Описание колонки |
| `GET/POST` | `/api/column-order/:table` | Порядок колонок (drag-and-drop) |
| `GET/POST/DELETE` | `/api/templates` | SQL-шаблоны |
| `GET` | `/api/stats` | Статистика БД |
| `GET/DELETE` | `/api/history` | История запросов |

## Скрипты

```bash
npm start       # Запуск сервера (node server.js)
npm test        # Заглушка (нет тестов)
```

## Требования

- Node.js 18+
- PostgreSQL 12+
- Доступ к БД с правами на чтение/запись схемы `public`

## Лицензия

ISC — см. `package.json`

## Автор

Сергей Валерьевич Бессонов ([@smilepps](https://t.me/smilepps))