// English UI strings — the source of truth. Other locales must provide the
// same keys (enforced by the Dict type). Interpolation uses {name} tokens.
export const en = {
  // ---- Index / menu ----
  tagline: "Claim city districts in the real world. Biggest connected cluster wins.",
  createGame: "Create a game",
  joinGame: "Join a game",
  rulesAbout: "Rules / About",
  mapAttribution: "Map data © OpenStreetMap contributors",
  language: "Language",

  // ---- Join ----
  joinTitle: "Join a game",
  lobbyCode: "Lobby code",
  teamName: "Team name",
  teamNamePlaceholder: "The Trailblazers",
  joining: "Joining…",
  joinLobby: "Join lobby",
  back: "Back",

  // ---- Create wizard ----
  chooseMap: "Choose the map",
  cancel: "Cancel",
  next: "Next",
  gameSettings: "Game settings",
  gameTimeLimit: "Game Time limit",
  hours: "hours",
  minutes: "minutes",
  openDeckFlopSize: "Open deck flop size",
  openDeckFlopHint:
    "Shared areas visible at once (minimum 2). A new one appears whenever one is claimed.",
  privateDeckSize: "Private deck size",
  privateDeckSizeHint: "Exclusive areas each team can claim only for itself.",
  privateUnveilPeriod: "Private deck unveil period",
  privateUnveilHint:
    "Private areas unlock one at a time on this interval. 0 = all from the start. Must be less than the game time limit.",
  challenges: "Challenges",
  challengesIntro: "Each area gets a challenge a team must complete to claim it.",
  useDefaultChallenges: "Use default generic challenges",
  teamSize: "Team size",
  onePlayer: "1 player",
  twoPlayers: "2 players",
  teamSize2Hint: "Adds two-person teammate challenges to the pool.",
  teamSize1Hint: "Solo-friendly challenges only.",
  supportsTeams: "These sizes support up to {n} team(s) with {areas} areas.",
  examplesHeader: "Examples:",
  useCustomChallenges: "Use custom challenges",
  customChallengesIntro:
    "Copy the template, fill in the challenges you want, paste it back, then Import. Matched by area name; any area you leave out uses a random default challenge.",
  copyTemplate: "Copy template",
  copied: "Copied!",
  aiPromptIntro:
    "Or build a ready-to-paste prompt that generates location-specific challenges for your selected areas. Run it in an AI, then paste the JSON reply below and Import.",
  copyPromptForAi: "Copy prompt for AI",
  importChallenges: "Import challenges",
  importCoverage:
    "Imported challenges for {n} of {total} areas. The other {rest} will use random default challenges.",
  importAll: "Validated — custom challenges set for all {total} areas.",
  clipboardTemplateFallback:
    "Couldn't reach the clipboard — template placed in the box below.",
  clipboardPromptFallback: "Couldn't reach the clipboard — prompt placed in the box below.",
  importContinueHint: "Import your challenges to continue.",
  yourTeam: "Your team",
  hostStartHint: "You are the host and can start the game.",
  creating: "Creating…",
  createLobby: "Create lobby",

  // ---- Challenge import validation ----
  errNotJson: "That's not valid JSON. Copy the template, fill in each challenge, and paste it back.",
  errNotArray: 'The JSON must be an array of { "area", "challenge" } objects.',
  errDupeNames:
    'Some selected areas share a name (e.g. "{name}"), so challenges can\'t be matched by name.',
  errMissingAreaName: 'Entry {index} is missing an "area" name.',
  errEmptyChallenge: 'The entry for "{name}" has an empty challenge.',
  errUnknownArea: '"{name}" isn\'t one of the selected areas.',
  errDuplicateEntry: '"{name}" appears more than once.',
  errNoEntries: "Add a challenge for at least one area, or switch to default challenges.",

  // ---- Area selector ----
  searchCityLabel: "Search a city or district",
  searchCityPlaceholder: "e.g. Utrecht, Camden, Kreuzberg",
  searchCityHint:
    "Pick an administrative boundary, then choose which sub-level to divide it into.",
  searchInView: "Search in this map view instead of city",
  subDivisionLevel: "Sub-division level",
  level: "Level {n}",
  searchInViewHint:
    "Searches this level across the current map view, even other cities. Pan/zoom the map first.",
  levelHint:
    "Level 8 ≈ municipalities/suburbs · 9–10 ≈ neighbourhoods (availability varies by country).",
  areasFound: "{n} areas found",
  areasSelected: "{n} selected",
  selectAll: "Select all",
  deselectAll: "Deselect all",
  tapAreasHint: "Tap areas on the map to include them in the game.",

  // ---- Lobby ----
  lobby: "Lobby",
  shareCode: "Share this code",
  copyInviteLink: "Copy invite link",
  allAtStart: "All at start",
  gameArea: "Game area",
  teamsCount: "Teams ({n})",
  you: "you",
  host: "host",
  startGame: "Start game",
  needAnotherTeam: "You need at least one other team to start.",
  notEnoughAreas:
    "Not enough areas: {teams} teams need at least {needed} (each team's private deck plus the open flop), but only {have} are in the game. Have a team leave, or recreate the game with more areas or smaller decks.",
  waitingForHost: "Waiting for the host to start the game…",
  leave: "Leave",

  // ---- Play / connection ----
  loadingGame: "Loading game…",
  connecting: "Connecting…",

  // ---- Game HUD / announcements ----
  scoreTitle: "Score",
  nextAreaLabel: "Next area",
  announceClaim: "Area claimed",
  announceReveal: "New area in play",
  announceRemoved: "Area removed",
  msgTeamClaimed: "{team} claimed {area}",
  msgAreaRemoved: "{area} was removed from play.",
  msgNewAreaInPlay: "New area in play: {area}",
  fallbackArea: "an area",
  fallbackTeam: "A team",
  fallbackLeader: "the leader",

  // ---- Challenge sheet ----
  openDeck: "Open deck",
  private: "Private",
  completeToClaim: "Complete the challenge to claim the area:",
  markClaimed: "Mark as claimed",

  // ---- Protect / replace ----
  protectAreaTitle: "Protect area",
  replaceAreaTitle: "Replace area",
  protectConfirm: "Protect {area}? The scored team won't be able to replace it.",
  replaceConfirm: "Send {area} back to the deck and draw a new area?",
  protect: "Protect",
  replace: "Replace",
  ok: "OK",
  bannerProtector:
    "The scored team can replace one area from the open deck. Select the area you want to protect from it.",
  bannerClaimer: "Tap an area to replace it.",
  bannerClaimerWaiting:
    "Now you can replace one open deck area in the flop.\nWaiting for other teams to protect their areas.",
  bannerProtectorWaiting: "Waiting for other teams to protect their areas.",
  bannerWaitingForClaimer: "Waiting for {name} to replace an area…",

  // ---- Results ----
  noAreasClaimed: "No areas were claimed",
  teamWins: "{team} wins!",
  itsATie: "It's a tie: {names}",
  totalSuffix: "{n} total",
  tiebreakNote: "Largest connected cluster wins · ties broken by total areas.",
  backHome: "Back to home",

  // ---- About ----
  aboutTitle: "Rules & About",
  aboutIntroBefore: "City Scramble is a real-world, mobile territory game inspired by ",
  aboutJetLagLink: "Jet Lag: The Game",
  aboutIntroAfter:
    ". Teams roam a real city, complete area-specific challenges, and claim districts on a shared map.",
  aboutWinTitle: "How you win",
  aboutWin:
    "The team with the most connected areas at the end of the game wins. This is based solely on the number of areas; in the case of a tie, the team with the largest area wins. Areas only count as connected when they touch along their borders.",
  aboutFlopTitle: "The Flop",
  aboutFlop:
    "Gameplay revolves around a “Flop”. At the start of the game, some areas are randomly selected into the Flop, and only areas in the Flop may be claimed. Once an area is claimed, a new area is drawn to replace it, and the claiming team gets to pick one area already in the Flop to redraw as well. Each opposing team may protect one area from being redrawn.",
  aboutAreaTypesTitle: "Area types",
  aboutOpenDeckLabel: "Open deck areas",
  aboutOpenDeckDesc:
    "— shared areas whose challenges everyone can see beforehand. These challenges can't be failed, though some carry a time penalty when re-attempted.",
  aboutPrivateDeckLabel: "Private deck areas",
  aboutPrivateDeckDesc:
    "— each team receives its own private areas and reveals one per period. Only that team can see and claim them; the other teams don't know they exist.",
  aboutHowToPlayTitle: "How to play",
  aboutStep1:
    "One team creates the lobby and configures the game area, timing, deck sizes, and challenges.",
  aboutStep2: "The other teams join the lobby with the 4-letter code.",
  aboutStep3: "Everyone shares live location and chats in any messaging app they like.",
  aboutColorsIntro: "Once the game starts, areas on the map are colored:",
  aboutLegendOpen: "translucent gray — shared open-deck areas",
  aboutLegendPrivate: "translucent team color — your private areas (hidden from other teams)",
  aboutLegendClaimed: "solid saturated color — areas claimed by a team",
  aboutTopBar:
    "At the top of the screen you can see the score (your largest connected cluster and total areas claimed), the countdown to the end of the game, and the countdown to your next private area. Whenever someone claims an area — or an action is required from you — the game notifies or prompts you.",
  aboutDisclaimerTitle: "Disclaimer",
  aboutDisclaimerBefore:
    "This game is not affiliated with, connected to, or produced by Jet Lag: The Game or Nebula. Map data and areas are sourced from ",
  aboutOsmLink: "OpenStreetMap",
  aboutDisclaimerAfter: " contributors.",
  aboutSource: "Source code: ",
  backToMenu: "Back to menu",
};

export type Dict = typeof en;
export type TKey = keyof Dict;
