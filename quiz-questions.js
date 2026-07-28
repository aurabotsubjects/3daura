// ============================================================
// AURA Robot Activity — Landmark Quiz Question Bank
// Edit this list to add, remove, or change quiz questions.
// 'a' is the zero-based index of the correct option in 'o'.
// ============================================================
const LANDMARK_QUESTIONS = [
    { q: "Which country is home to the Eiffel Tower?", o: ["France", "Italy", "Spain", "Belgium"], a: 0 },
    { q: "Where can you visit the ancient Inca citadel Machu Picchu?", o: ["Brazil", "Peru", "Colombia", "Chile"], a: 1 },
    { q: "The Taj Mahal is a world-famous marble mausoleum located in:", o: ["Pakistan", "Bangladesh", "India", "Nepal"], a: 2 },
    { q: "Which country hosts the historic amphitheater known as the Colosseum?", o: ["Greece", "Egypt", "Italy", "Turkey"], a: 2 },
    { q: "The Great Wall, stretching thousands of miles, is located in:", o: ["Japan", "China", "Mongolia", "Vietnam"], a: 1 },
    { q: "The archaeological rose-red city of Petra is located in:", o: ["Jordan", "Egypt", "Saudi Arabia", "Iraq"], a: 0 },
    { q: "Angkor Wat, the massive Hindu-Buddhist temple complex, is in:", o: ["Thailand", "Vietnam", "Laos", "Cambodia"], a: 3 },
    { q: "The Mayan step pyramid Chichen Itza can be visited in:", o: ["Guatemala", "Mexico", "Honduras", "Belize"], a: 1 },
    { q: "Which country is home to the Acropolis and Parthenon?", o: ["Italy", "Turkey", "Greece", "Cyprus"], a: 2 },
    { q: "The iconic Sydney Opera House with its sail-like roof is in:", o: ["New Zealand", "Australia", "UK", "South Africa"], a: 1 }
];

// ============================================================
// AURA Robot Activity — Great Writing Words Quiz Question Bank
// Vocabulary and literary terms good young writers should know.
// ============================================================
const WORDS_QUESTIONS = [
    { q: "In writing, what does it mean if a description is 'vivid'?", o: ["Very short", "Creates a clear, powerful picture in your mind", "Written in the past tense", "Full of long words"], a: 1 },
    { q: "A 'metaphor' describes something by saying it:", o: ["IS something else (without using 'like' or 'as')", "Sounds like something else", "Is compared using 'like' or 'as'", "Rhymes with another word"], a: 0 },
    { q: "A 'simile' compares two things using which words?", o: ["'Because' or 'so'", "'Like' or 'as'", "'And' or 'but'", "'Then' or 'next'"], a: 1 },
    { q: "The 'protagonist' of a story is:", o: ["The villain", "The setting", "The main character", "The author"], a: 2 },
    { q: "If someone speaks or writes in an 'eloquent' way, they are:", o: ["Very fluent, clear, and persuasive", "Very quiet and shy", "Confusing and messy", "Speaking another language"], a: 0 },
    { q: "'Onomatopoeia' words are special because they:", o: ["Always start with a vowel", "Imitate the sound they describe, like 'buzz' or 'splash'", "Are always adjectives", "Never appear in poems"], a: 1 },
    { q: "In a story, the 'dialogue' is:", o: ["The title of the book", "The conversation between characters", "The last chapter", "The cover illustration"], a: 1 },
    { q: "A 'synonym' is a word that:", o: ["Means the opposite of another word", "Sounds the same as another word", "Means the same or almost the same as another word", "Is always capitalized"], a: 2 },
    { q: "If a piece of writing is 'concise', it is:", o: ["Extremely long and detailed", "Clear and to the point, using few words", "Written only in questions", "Full of spelling mistakes"], a: 1 },
    { q: "The 'climax' of a story is:", o: ["The first sentence", "The list of characters", "The most exciting or important turning point", "The dedication page"], a: 2 }
];

// ============================================================
// AURA Robot Activity — World Famous People Quiz Question Bank
// Well-known historical and cultural figures, kid-friendly facts.
// ============================================================
const FAMOUS_PEOPLE_QUESTIONS = [
    { q: "Albert Einstein is best known for developing which scientific theory?", o: ["The Theory of Evolution", "The Theory of Relativity", "The Theory of Gravity", "Germ Theory"], a: 1 },
    { q: "Who was the first person to walk on the Moon?", o: ["Buzz Aldrin", "Yuri Gagarin", "Neil Armstrong", "John Glenn"], a: 2 },
    { q: "Leonardo da Vinci painted which famous portrait?", o: ["The Scream", "The Mona Lisa", "Starry Night", "American Gothic"], a: 1 },
    { q: "Marie Curie won Nobel Prizes for her pioneering research into:", o: ["Radioactivity", "Gravity", "Electricity", "Photosynthesis"], a: 0 },
    { q: "Martin Luther King Jr. is remembered for his fight for:", o: ["Space exploration", "Civil rights and equality", "Ocean conservation", "Ancient history"], a: 1 },
    { q: "Who wrote famous plays like 'Romeo and Juliet' and 'Hamlet'?", o: ["Charles Dickens", "William Shakespeare", "Mark Twain", "Jane Austen"], a: 1 },
    { q: "Nelson Mandela became the first Black president of which country?", o: ["Kenya", "Nigeria", "South Africa", "Egypt"], a: 2 },
    { q: "Amelia Earhart was a famous pioneer in which field?", o: ["Aviation (flying planes)", "Medicine", "Music", "Painting"], a: 0 },
    { q: "Mahatma Gandhi led India's independence movement mainly through:", o: ["Building weapons", "Peaceful, non-violent protest", "Winning wars", "Writing novels"], a: 1 },
    { q: "Walt Disney is famous for creating which classic cartoon character?", o: ["Bugs Bunny", "SpongeBob", "Mickey Mouse", "Tom and Jerry"], a: 2 }
];

// ============================================================
// AURA Robot Activity — Famous Art Pieces Quiz Question Bank
// Iconic paintings and sculptures, kid-friendly facts.
// ============================================================
const ART_QUESTIONS = [
    { q: "Who painted 'The Starry Night'?", o: ["Pablo Picasso", "Vincent van Gogh", "Claude Monet", "Salvador Dalí"], a: 1 },
    { q: "The famous painting 'The Mona Lisa' is displayed in which museum?", o: ["The British Museum", "The Louvre", "MoMA", "The Vatican Museums"], a: 1 },
    { q: "Who painted the famous artwork 'The Scream'?", o: ["Edvard Munch", "Henri Matisse", "Andy Warhol", "Rembrandt"], a: 0 },
    { q: "Michelangelo famously painted the ceiling of which chapel?", o: ["Notre Dame", "The Sistine Chapel", "St. Paul's Cathedral", "Westminster Abbey"], a: 1 },
    { q: "Which artist is known for surreal paintings of melting clocks, like 'The Persistence of Memory'?", o: ["Salvador Dalí", "Georgia O'Keeffe", "Frida Kahlo", "Jackson Pollock"], a: 0 },
    { q: "'Girl with a Pearl Earring' was painted by which artist?", o: ["Johannes Vermeer", "Michelangelo", "Rembrandt", "Titian"], a: 0 },
    { q: "Leonardo da Vinci's painting 'The Last Supper' shows Jesus with his:", o: ["Family", "Twelve disciples", "Students at school", "Royal court"], a: 1 },
    { q: "The painting 'American Gothic', showing a farmer holding a pitchfork, was painted by:", o: ["Grant Wood", "Norman Rockwell", "Edward Hopper", "Andrew Wyeth"], a: 0 },
    { q: "Pablo Picasso's famous painting 'Guernica' shows the horrors of:", o: ["A festival", "War", "A storm", "A journey"], a: 1 },
    { q: "The ancient statue 'Venus de Milo' is famous for missing which body part?", o: ["Her head", "Her arms", "Her feet", "Her nose"], a: 1 }
];

