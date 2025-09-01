import { ParsedTicket } from '../types';
import { parseBA, looksLikeBA, enrichBAData } from './ba';
import { parseGeneric } from './generic';
import { getParserMode } from '../env';

export interface ParseInput {
  text?: string;
  html?: string;
}

export async function parseTicket(input: ParseInput): Promise<ParsedTicket> {
  const parserMode = getParserMode();
  const detectedCarrier = detectCarrier(input);

  console.log(`Parser mode: ${parserMode}, Detected carrier: ${detectedCarrier}`);

  if (parserMode === 'ai_first') {
    // AI-first mode: Use AI extraction as primary, enrich with carrier-specific data
    try {
      console.log('Using AI-first parsing mode');
      const aiResult = await parseGeneric(input, detectedCarrier || undefined);

      // Enrich with carrier-specific data if available
      if (detectedCarrier === 'BA' && looksLikeBA(input)) {
        console.log('Enriching AI result with BA-specific data');
        return await enrichBAData(aiResult, input);
      }

      // TODO: Add enrichment for other carriers
      // if (detectedCarrier === 'AF' && looksLikeAF(input)) {
      //   return await enrichAFData(aiResult, input);
      // }

      return aiResult;
    } catch (error) {
      console.warn('AI parsing failed, falling back to carrier-specific:', error);
      // Fall through to carrier-specific parsing
    }
  }

  // Regex-first mode (legacy) or AI-first fallback
  console.log('Using regex-first parsing mode or AI fallback');
  
  if (looksLikeBA(input)) {
    try {
      return await parseBA(input);
    } catch (error) {
      console.warn('BA parser failed, falling back to generic:', error);
      // Fall through to generic parser
    }
  }
  
  // TODO: Add more carrier-specific parsers here
  // if (looksLikeAF(input)) return parseAF(input);
  // if (looksLikeKL(input)) return parseKL(input);
  // if (looksLikeLH(input)) return parseLH(input);
  // if (looksLikeVS(input)) return parseVS(input);
  
  // Final fallback to LLM-backed generic parser
  return await parseGeneric(input);
}

// Helper functions for carrier detection
export function detectCarrier(input: ParseInput): string | null {
  const text = input.text || '';
  const html = input.html || '';
  const content = (text + ' ' + html).toLowerCase();
  
  // British Airways
  if (content.includes('british airways') || 
      content.includes('ba.com') ||
      /ba\d{3,4}/.test(content)) {
    return 'BA';
  }
  
  // Air France
  if (content.includes('air france') || 
      content.includes('airfrance.') ||
      /af\d{3,4}/.test(content)) {
    return 'AF';
  }
  
  // KLM
  if (content.includes('klm ') || 
      content.includes('klm.') ||
      /kl\d{3,4}/.test(content)) {
    return 'KL';
  }
  
  // Lufthansa
  if (content.includes('lufthansa') || 
      content.includes('lufthansa.') ||
      /lh\d{3,4}/.test(content)) {
    return 'LH';
  }
  
  // Virgin Atlantic
  if (content.includes('virgin atlantic') || 
      content.includes('virgin-atlantic.') ||
      /vs\d{3,4}/.test(content)) {
    return 'VS';
  }
  
  // South African Airways
  if (content.includes('south african airways') || 
      content.includes('flysaa.com') ||
      /\bsa\s?\d{3,4}/i.test(content)) {
    return 'SA';
  }
  
  return null;
}