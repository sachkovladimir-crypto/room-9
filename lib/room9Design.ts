export type RosterArtist = {
  name: string;
  cityCode: string;
  location: string;
  genre: string;
  bpm: string;
  status: string;
  imagePosition: string;
};

export type RoomEvent = {
  month: string;
  day: string;
  title: string;
  venue: string;
  lineup: string;
};

export type StreamArchive = {
  artist: string;
  title: string;
  date: string;
  duration: string;
  imagePosition: string;
};

export const rosterArtists: RosterArtist[] = [
  {
    name: "KLANGKUENSTLER",
    cityCode: "BER",
    location: "Berlin, DE",
    genre: "Hard Techno",
    bpm: "145 BPM",
    status: "Available",
    imagePosition: "8% 39%"
  },
  {
    name: "AMELIE LENS",
    cityCode: "BRU",
    location: "Antwerp, BE",
    genre: "Acid",
    bpm: "138 BPM",
    status: "Touring",
    imagePosition: "37% 39%"
  },
  {
    name: "DVS1",
    cityCode: "MSP",
    location: "Minneapolis, US",
    genre: "Hypnotic",
    bpm: "132 BPM",
    status: "Warehouse",
    imagePosition: "61% 39%"
  },
  {
    name: "RENE WISE",
    cityCode: "LDN",
    location: "London, UK",
    genre: "Groove",
    bpm: "135 BPM",
    status: "Local",
    imagePosition: "84% 39%"
  }
];

export const processSteps = [
  {
    title: "Discover",
    text: "Listen first: browse sets, filters, queues, city signals and artist dossiers from one desktop surface."
  },
  {
    title: "Mark",
    text: "Capture the timestamp that proves the sound direction: peak moment, drop, closing energy or warm-up texture."
  },
  {
    title: "Book",
    text: "Turn that sound reference into an atmosphere brief with fee, rider, chat, escrow preview, status and timeline."
  }
];

export const roomEvents: RoomEvent[] = [
  {
    month: "Oct",
    day: "24",
    title: "Berghain Klubnacht",
    venue: "Berlin, DE - Berghain / Panorama Bar",
    lineup: "Ben Klock, Marcel Dettmann, DVS1"
  },
  {
    month: "Nov",
    day: "12",
    title: "Awakenings",
    venue: "Amsterdam, NL - Gashouder",
    lineup: "Charlotte de Witte, Enrico Sangiuliano"
  },
  {
    month: "Dec",
    day: "31",
    title: "Printworks Closing",
    venue: "London, UK - Printworks",
    lineup: "Bicep (Live), Peggy Gou, Nina Kraviz"
  }
];

export const eventRows: RoomEvent[] = [
  {
    month: "Oct",
    day: "24",
    title: "Void Resonance",
    venue: "Basement, Berlin",
    lineup: "DVS1 + Rodhad + Blawan / Visuals by HEX"
  },
  {
    month: "Nov",
    day: "08",
    title: "Industrial Decay",
    venue: "Warehouse 4, London",
    lineup: "Surgeon + Paula Temple / Live modular set"
  },
  {
    month: "Dec",
    day: "15",
    title: "Synaptic Shift",
    venue: "Sector 9, Amsterdam",
    lineup: "Objekt + Call Super / Extended B2B"
  }
];

export const streamUpcoming = [
  {
    date: "Oct 24",
    time: "23:00 CET",
    artist: "Dax J",
    place: "Monnom / London"
  },
  {
    date: "Oct 25",
    time: "01:30 CET",
    artist: "VTSS",
    place: "Basement / New York"
  },
  {
    date: "Oct 26",
    time: "22:00 CET",
    artist: "Hector Oaks",
    place: "Herrensauna / Berlin"
  }
];

export const streamArchive: StreamArchive[] = [
  {
    artist: "Ben Klock",
    title: "Awakenings Festival",
    date: "Sep 12, 2025",
    duration: "02:14:59",
    imagePosition: "14% 67%"
  },
  {
    artist: "Nina Kraviz",
    title: "Time Warp DE",
    date: "Apr 06, 2025",
    duration: "01:45:29",
    imagePosition: "53% 67%"
  },
  {
    artist: "SNTS",
    title: "Verknipt Amsterdam",
    date: "Jul 22, 2025",
    duration: "03:00:05",
    imagePosition: "83% 67%"
  }
];
