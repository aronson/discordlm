export interface CharacterCard {
    char_name: string;
    char_persona: string;
    world_scenario: string;
    char_greeting: string;
    example_dialogue: string;
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    metadata?: {
        version?: number;
        created?: number;
        modified?: number;
        source?: string | null;
        tool?: {
            name?: string;
            version?: string;
            url?: string;
        };
    };
}

export interface CharacterConfig {
    card: CharacterCard;
    avatarUrl?: string;
    filename: string;
}

/**
 * Extract character card data from PNG metadata
 * Character cards are typically stored in PNG tEXt chunks with key "chara"
 */
export async function parseCharacterCardFromPNG(filePath: string): Promise<CharacterCard | null> {
    try {
        const fileData = await Deno.readFile(filePath);

        // Look for PNG tEXt chunks containing character data
        // PNG format: signature (8 bytes) + chunks
        let offset = 8; // Skip PNG signature

        while (offset < fileData.length - 8) {
            // Read chunk length (4 bytes, big endian)
            const chunkLength = new DataView(fileData.buffer, offset, 4).getUint32(0, false);
            offset += 4;

            // Read chunk type (4 bytes)
            const chunkType = new TextDecoder().decode(fileData.slice(offset, offset + 4));
            offset += 4;

            if (chunkType === "tEXt") {
                // Read chunk data
                const chunkData = fileData.slice(offset, offset + chunkLength);
                const textData = new TextDecoder().decode(chunkData);

                // Find null separator between keyword and text
                const nullIndex = textData.indexOf("\0");
                if (nullIndex > -1) {
                    const keyword = textData.substring(0, nullIndex);
                    const text = textData.substring(nullIndex + 1);

                    if (keyword === "chara") {
                        try {
                            // Character data is base64 encoded
                            const decodedData = atob(text);
                            return JSON.parse(decodedData) as CharacterCard;
                        } catch (e) {
                            console.warn(`Failed to parse character data from ${filePath}:`, e);
                        }
                    }
                }
            }

            // Skip chunk data and CRC (4 bytes)
            offset += chunkLength + 4;
        }

        return null;
    } catch (error) {
        console.error(`Error reading PNG file ${filePath}:`, error);
        return null;
    }
}

/**
 * Parse character card data from JSON file
 */
export async function parseCharacterCardFromJSON(filePath: string): Promise<CharacterCard | null> {
    try {
        const fileData = await Deno.readTextFile(filePath);
        const card = JSON.parse(fileData) as CharacterCard;

        // Validate required fields
        if (card.name || card.char_name) {
            return card;
        } else {
            console.warn(`Invalid character card in ${filePath}: missing name field`);
            return null;
        }
    } catch (error) {
        console.error(`Error reading JSON file ${filePath}:`, error);
        return null;
    }
}

/**
 * Load all character cards from the characters directory
 */
export async function loadCharacterCards(
    charactersDir: string = "./characters",
    avatarBaseUrl?: string,
): Promise<CharacterConfig[]> {
    // Resolve the absolute path to handle binary execution from different directories
    const resolvedDir = new URL(charactersDir, `file://${Deno.cwd()}/`).pathname;
    const characters: CharacterConfig[] = [];

    try {
        const entries = Deno.readDir(resolvedDir);

        for await (const entry of entries) {
            if (entry.isFile) {
                const filePath = `${resolvedDir}/${entry.name}`;
                let card: CharacterCard | null = null;
                let avatarUrl: string | undefined;

                if (entry.name.toLowerCase().endsWith(".png")) {
                    card = await parseCharacterCardFromPNG(filePath);
                    // For PNG files, use the PNG file itself as the avatar
                    avatarUrl = avatarBaseUrl ? `${avatarBaseUrl}/avatars/${entry.name}` : filePath;
                } else if (entry.name.toLowerCase().endsWith(".json")) {
                    card = await parseCharacterCardFromJSON(filePath);
                    // For JSON files, look for a corresponding PNG file with the same base name
                    const baseName = entry.name.substring(0, entry.name.lastIndexOf("."));
                    const pngPath = `${resolvedDir}/${baseName}.png`;
                    try {
                        await Deno.stat(pngPath);
                        avatarUrl = avatarBaseUrl ? `${avatarBaseUrl}/avatars/${baseName}.png` : pngPath;
                    } catch {
                        // No corresponding PNG file found, that's okay
                    }
                }

                if (card) {
                    characters.push({
                        card,
                        filename: entry.name,
                        avatarUrl,
                    });
                } else if (entry.name.toLowerCase().endsWith(".png") || entry.name.toLowerCase().endsWith(".json")) {
                    console.warn(`No character data found in ${entry.name}`);
                }
            }
        }
    } catch (error) {
        console.error(`Error loading characters from ${resolvedDir}:`, error);
    }

    return characters;
}

/**
 * Get a character by name (case insensitive)
 */
export function getCharacterByName(characters: CharacterConfig[], name: string): CharacterConfig | null {
    const normalized = name.toLowerCase().trim();
    return characters.find((char) =>
        (char.card.name && char.card.name.toLowerCase() === normalized) ||
        (char.card.char_name && char.card.char_name.toLowerCase() === normalized)
    ) || null;
}
