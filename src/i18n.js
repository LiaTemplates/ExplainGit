// Texts of the widget. Git commands are never translated.
// The language comes from <html lang>: the course `language:` or Google Translate.

const TEXT = {
  en: {
    // widget
    intro: 'Type in your git commands below.',
    reset: 'Reset',
    resetTitle: 'Start again from the initial repository',
    collab: 'Collaborate',
    collabTitle: 'Work on one repository together with the classroom',
    alone: 'Work alone',
    aloneTitle: 'Leave the shared repository and continue on your own',
    shared: n => `shared repository · ${n} online`,
    sharedNoCount: 'shared repository',
    joined: 'Collaborative mode: everybody in the classroom works on this repository.',
    left: 'You work on your own repository again.',
    cleared: 'The shared repository was reset.',
    ownerOnly: 'Only the owner of the classroom can reset the shared repository.',
    graph: 'Commit graph',
    command: 'git command',
    placeholder: 'enter git command',
    // quiz feedback
    notLoaded: 'The repository is not loaded yet.',
    missing: r => `${r} is missing.`,
    extra: r => `${r} should not exist.`,
    wrongRef: r => `${r} does not point to the right commit yet.`,
    head: 'HEAD is not at the right place yet.',
    shape: 'The branches do not share the right commits yet.',
    branch: n => `Branch "${n}"`,
    tag: n => `Tag "${n}"`,
    origin: s => `origin: ${s}`,
    summaryHead: b => (b ? `Current branch ${b}.` : 'Detached HEAD.'),
    summaryRef: (r, id) => `${r} at ${id}.`,
    // repository view
    localRepo: 'Local Repository',
    currentBranch: b => `Current Branch: ${b}`,
    detachedHead: 'Current Branch: DETACHED HEAD',
    // console messages
    unknown: "I don't understand that.",
    branchList: "You need to give a branch name. Normally if you don't give a name, this command will list your local branches on the screen.",
    branchRemote: 'This command normally displays all of your remote tracking branches.',
    branchAll: 'This command normally displays all of your tracking branches, both remote and local.',
    tagList: "You need to give a tag name. Normally if you don't give a name, this command will list your local tags on the screen.",
    resetSoft: 'The "--soft" flag works in real git, but I am unable to show you how it works in this demo. So I am just going to show you what "--hard" looks like instead.',
    resetMixed: 'The "--mixed" flag works in real git, but I am unable to show you how it works in this demo.',
    resetHard: 'Assuming "--hard".',
    clean: 'Deleting all of your untracked files...',
    noFFOnly: 'This demo only supports the --no-ff switch.',
    fastForward: 'You have performed a fast-forward merge.',
    fastForwardTo: r => `Fast-forwarded to ${r}.`,
    noRemote: 'There is no remote server to fetch from.',
    fetched: (n, b) => `Fetched ${n} commits on ${b}.`,
    notOnBranch: 'You are not currently on a branch.',
    noUpstream: 'Current branch is not set up for pulling.',
    remoteHistory: 'Sorry, you can\'t have a remote named "history" in this example.',
    noRemoteNamed: r => `There is no remote server named "${r}".`,
    noLocalRef: r => `Local ref: ${r} does not exist.`,
    noRemoteBranch: 'No remote branch was specified to push to.',
    pushRejected: 'Push rejected. Non fast-forward.',
    upToDateAll: 'Everything up-to-date.',
    noNewRemoteBranch: 'Sorry, creating new remote branches is not supported yet.',
    detachedCommit: 'Not a good idea to make commits while in a detached HEAD state.',
    needBranchName: 'You need to give a branch name.',
    branchHead: 'You cannot name your branch "HEAD".',
    branchSpaces: 'Branch names cannot contain spaces.',
    branchExists: n => `Branch "${n}" already exists.`,
    deleteCurrent: 'Cannot delete the currently checked-out branch.',
    noBranch: "That branch doesn't exist.",
    noCommit: r => `Cannot find commit: ${r}`,
    noRef: r => `Cannot find ref: ${r}`,
    notAncestor: r => `${r} is not an ancestor of HEAD.`,
    upToDate: 'Already up-to-date.'
  },
  de: {
    intro: 'Gib unten deine Git-Befehle ein.',
    reset: 'Zurücksetzen',
    resetTitle: 'Neu beginnen mit dem Ausgangs-Repository',
    collab: 'Gemeinsam arbeiten',
    collabTitle: 'Mit dem Klassenraum an einem Repository arbeiten',
    alone: 'Allein arbeiten',
    aloneTitle: 'Das gemeinsame Repository verlassen und allein weitermachen',
    shared: n => `gemeinsames Repository · ${n} online`,
    sharedNoCount: 'gemeinsames Repository',
    joined: 'Gemeinsamer Modus: Alle im Klassenraum arbeiten an diesem Repository.',
    left: 'Du arbeitest wieder an deinem eigenen Repository.',
    cleared: 'Das gemeinsame Repository wurde zurückgesetzt.',
    ownerOnly: 'Nur die Leitung des Klassenraums kann das gemeinsame Repository zurücksetzen.',
    graph: 'Commit-Graph',
    command: 'Git-Befehl',
    placeholder: 'Git-Befehl eingeben',
    notLoaded: 'Das Repository ist noch nicht geladen.',
    missing: r => `${r} fehlt.`,
    extra: r => `${r} sollte es nicht geben.`,
    wrongRef: r => `${r} zeigt noch nicht auf den richtigen Commit.`,
    head: 'HEAD steht noch nicht an der richtigen Stelle.',
    shape: 'Die Branches teilen sich noch nicht die richtigen Commits.',
    branch: n => `Branch „${n}“`,
    tag: n => `Tag „${n}“`,
    origin: s => `origin: ${s}`,
    summaryHead: b => (b ? `Aktueller Branch ${b}.` : 'HEAD ist losgelöst.'),
    summaryRef: (r, id) => `${r} bei ${id}.`,
    localRepo: 'Lokales Repository',
    currentBranch: b => `Aktueller Branch: ${b}`,
    detachedHead: 'Aktueller Branch: losgelöster HEAD',
    unknown: 'Das verstehe ich nicht.',
    branchList: 'Gib einen Branch-Namen an. Ohne Namen listet dieser Befehl normalerweise deine lokalen Branches auf.',
    branchRemote: 'Dieser Befehl zeigt normalerweise alle Remote-Tracking-Branches an.',
    branchAll: 'Dieser Befehl zeigt normalerweise alle Tracking-Branches an, lokale und entfernte.',
    tagList: 'Gib einen Tag-Namen an. Ohne Namen listet dieser Befehl normalerweise deine lokalen Tags auf.',
    resetSoft: 'Die Option „--soft“ gibt es in echtem Git, diese Demo kann sie aber nicht zeigen. Stattdessen siehst du, wie „--hard“ aussieht.',
    resetMixed: 'Die Option „--mixed“ gibt es in echtem Git, diese Demo kann sie aber nicht zeigen.',
    resetHard: 'Ich nehme „--hard“ an.',
    clean: 'Alle nicht versionierten Dateien werden gelöscht …',
    noFFOnly: 'Diese Demo unterstützt nur die Option --no-ff.',
    fastForward: 'Das war ein Fast-Forward-Merge.',
    fastForwardTo: r => `Fast-Forward auf ${r}.`,
    noRemote: 'Es gibt keinen Remote-Server, von dem geholt werden kann.',
    fetched: (n, b) => `${n} Commits auf ${b} geholt.`,
    notOnBranch: 'Du bist gerade auf keinem Branch.',
    noUpstream: 'Der aktuelle Branch ist nicht zum Pullen eingerichtet.',
    remoteHistory: 'Ein Remote namens „history“ ist in diesem Beispiel nicht möglich.',
    noRemoteNamed: r => `Es gibt keinen Remote-Server namens „${r}“.`,
    noLocalRef: r => `Die lokale Referenz ${r} existiert nicht.`,
    noRemoteBranch: 'Es wurde kein Remote-Branch zum Pushen angegeben.',
    pushRejected: 'Push abgelehnt: kein Fast-Forward.',
    upToDateAll: 'Alles ist aktuell.',
    noNewRemoteBranch: 'Neue Remote-Branches werden noch nicht unterstützt.',
    detachedCommit: 'Mit losgelöstem HEAD solltest du besser nicht committen.',
    needBranchName: 'Gib einen Branch-Namen an.',
    branchHead: 'Ein Branch darf nicht „HEAD“ heißen.',
    branchSpaces: 'Branch-Namen dürfen keine Leerzeichen enthalten.',
    branchExists: n => `Branch „${n}“ existiert bereits.`,
    deleteCurrent: 'Der ausgecheckte Branch kann nicht gelöscht werden.',
    noBranch: 'Diesen Branch gibt es nicht.',
    noCommit: r => `Commit nicht gefunden: ${r}`,
    noRef: r => `Referenz nicht gefunden: ${r}`,
    notAncestor: r => `${r} ist kein Vorgänger von HEAD.`,
    upToDate: 'Bereits aktuell.'
  },
  uk: {
    intro: 'Введіть свої git-команди нижче.',
    reset: 'Скинути',
    resetTitle: 'Почати знову з початкового репозиторію',
    collab: 'Працювати разом',
    collabTitle: 'Працювати над одним репозиторієм разом із класом',
    alone: 'Працювати самостійно',
    aloneTitle: 'Вийти зі спільного репозиторію й продовжити самостійно',
    shared: n => `спільний репозиторій · ${n} онлайн`,
    sharedNoCount: 'спільний репозиторій',
    joined: 'Спільний режим: усі в класі працюють над цим репозиторієм.',
    left: 'Ви знову працюєте над власним репозиторієм.',
    cleared: 'Спільний репозиторій скинуто.',
    ownerOnly: 'Лише власник класу може скинути спільний репозиторій.',
    graph: 'Граф комітів',
    command: 'git-команда',
    placeholder: 'введіть git-команду',
    notLoaded: 'Репозиторій ще не завантажено.',
    missing: r => `${r} відсутня.`,
    extra: r => `${r} не повинна існувати.`,
    wrongRef: r => `${r} ще не вказує на правильний коміт.`,
    head: 'HEAD ще не на правильному місці.',
    shape: 'Гілки ще не мають правильних спільних комітів.',
    branch: n => `Гілка «${n}»`,
    tag: n => `Тег «${n}»`,
    origin: s => `origin: ${s}`,
    summaryHead: b => (b ? `Поточна гілка ${b}.` : 'Від’єднаний HEAD.'),
    summaryRef: (r, id) => `${r} на ${id}.`,
    localRepo: 'Локальний репозиторій',
    currentBranch: b => `Поточна гілка: ${b}`,
    detachedHead: 'Поточна гілка: від’єднаний HEAD',
    unknown: 'Я цього не розумію.',
    branchList: 'Вкажіть назву гілки. Без назви ця команда зазвичай показує ваші локальні гілки.',
    branchRemote: 'Ця команда зазвичай показує всі гілки віддаленого відстеження.',
    branchAll: 'Ця команда зазвичай показує всі гілки відстеження, локальні й віддалені.',
    tagList: 'Вкажіть назву тегу. Без назви ця команда зазвичай показує ваші локальні теги.',
    resetSoft: 'Параметр «--soft» працює у справжньому git, але ця демонстрація не може його показати. Натомість ви побачите, як виглядає «--hard».',
    resetMixed: 'Параметр «--mixed» працює у справжньому git, але ця демонстрація не може його показати.',
    resetHard: 'Припускаю «--hard».',
    clean: 'Видалення всіх невідстежуваних файлів…',
    noFFOnly: 'Ця демонстрація підтримує лише параметр --no-ff.',
    fastForward: 'Ви виконали fast-forward злиття.',
    fastForwardTo: r => `Fast-forward до ${r}.`,
    noRemote: 'Немає віддаленого сервера, з якого можна отримати зміни.',
    fetched: (n, b) => `Отримано комітів у ${b}: ${n}.`,
    notOnBranch: 'Ви зараз не на гілці.',
    noUpstream: 'Поточну гілку не налаштовано для pull.',
    remoteHistory: 'У цьому прикладі не може бути віддаленого репозиторію з назвою «history».',
    noRemoteNamed: r => `Немає віддаленого сервера з назвою «${r}».`,
    noLocalRef: r => `Локального посилання ${r} не існує.`,
    noRemoteBranch: 'Не вказано віддалену гілку для push.',
    pushRejected: 'Push відхилено: не fast-forward.',
    upToDateAll: 'Усе актуально.',
    noNewRemoteBranch: 'Створення нових віддалених гілок поки не підтримується.',
    detachedCommit: 'Не варто робити коміти з від’єднаним HEAD.',
    needBranchName: 'Вкажіть назву гілки.',
    branchHead: 'Гілку не можна назвати «HEAD».',
    branchSpaces: 'Назви гілок не можуть містити пробілів.',
    branchExists: n => `Гілка «${n}» вже існує.`,
    deleteCurrent: 'Не можна видалити гілку, на якій ви зараз перебуваєте.',
    noBranch: 'Такої гілки не існує.',
    noCommit: r => `Коміт не знайдено: ${r}`,
    noRef: r => `Посилання не знайдено: ${r}`,
    notAncestor: r => `${r} не є предком HEAD.`,
    upToDate: 'Уже актуально.'
  }
}

// Google Translate sets lang="auto" when it goes back to the original page
let courseLang = 'en'
export function noteLang() {
  const html = document.documentElement
  if (html.lang && html.lang !== 'auto' && !/\btranslated-/.test(html.className)) courseLang = html.lang
}

// 'de-DE' -> 'de'; null when there are no own texts for that language
function own() {
  let code = document.documentElement.lang
  if (!code || code === 'auto') code = courseLang
  code = code.toLowerCase().split('-')[0]
  return TEXT[code] ? code : null
}

// the language the texts are shown in
export const lang = () => own() || 'en'

// own texts are not handed to Google Translate, English for other languages is
export const translatable = () => own() === null

// names (branches, refs, ids) are wrapped in the invisible isolate marks
// U+2068/U+2069, so fill() can keep Google Translate away from them
const mark = a => (/[\u2068\u2069]/.test(a) ? a : '\u2068' + a + '\u2069')

export function tr(key, ...args) {
  const t = TEXT[lang()][key] ?? TEXT.en[key]
  return typeof t === 'function' ? t(...args.map(a => mark(String(a)))) : t
}

// sets a message as text, the marked names as <span translate="no">;
// built before it is inserted, Google Translate only looks at new nodes once
export function fill(el, msg) {
  const parts = String(msg).split(/\u2068([^\u2068\u2069]*)\u2069/)
  // Google drops spaces next to untranslated text, so they move into the names
  for (let i = 1; i < parts.length; i += 2) {
    const before = parts[i - 1].match(/\s*$/)[0]
    const after = parts[i + 1].match(/^\s*/)[0]
    parts[i - 1] = parts[i - 1].slice(0, parts[i - 1].length - before.length)
    parts[i + 1] = parts[i + 1].slice(after.length)
    parts[i] = before + parts[i] + after
  }
  const box = document.createElement('span')
  parts.forEach((part, i) => {
    if (i % 2 === 0) return part && box.append(part)
    const name = document.createElement('span')
    name.className = 'notranslate'
    name.setAttribute('translate', 'no')
    name.textContent = part
    box.append(name)
  })
  el.replaceChildren(box)
}

// self-check: every language has every key
for (const code of Object.keys(TEXT))
  for (const key of Object.keys(TEXT.en))
    console.assert(key in TEXT[code], `ExplainGit i18n: ${code}.${key} missing`)
