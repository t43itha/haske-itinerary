import { NextRequest, NextResponse } from 'next/server';
import { parseTicket } from '@/lib/parsers';
import { detectCarrier } from '@/lib/parsers';
import { type ParsedTicket } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, html, carrierHint } = body;

    if (!text && !html) {
      return NextResponse.json(
        { error: 'Either text or html content is required' },
        { status: 400 }
      );
    }

    // Prepare input for parsing
    const parseInput = { text, html };

    // Detect carrier if not provided
    const detectedCarrier = carrierHint || detectCarrier(parseInput);

    console.log(`Parsing ticket - Detected carrier: ${detectedCarrier}`);

    // Parse the ticket data
    const parsedTicket = await parseTicket(parseInput);

    // Add some metadata about the parsing process
    const metadata = {
      detectedCarrier,
      hasText: !!text,
      hasHtml: !!html,
      textLength: text?.length || 0,
      htmlLength: html?.length || 0,
      parsedAt: new Date().toISOString(),
      parserUsed: detectedCarrier === 'BA' ? 'BA-specific' : 'generic'
    };

    return NextResponse.json({
      success: true,
      data: parsedTicket,
      metadata
    });

  } catch (error) {
    console.error('Parse API error:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to parse ticket data';
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.message.includes('OpenAI')) {
        errorMessage = 'LLM parsing service unavailable. Please try again later.';
        statusCode = 503;
      } else if (error.message.includes('Invalid')) {
        errorMessage = error.message;
        statusCode = 400;
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      { 
        error: errorMessage,
        details: error instanceof Error ? error.stack : 'Unknown error'
      },
      { status: statusCode }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { 
      message: 'Parse API endpoint',
      description: 'Parses extracted text into structured ticket data',
      supportedCarriers: ['BA', 'Generic (LLM fallback)'],
      requiredFields: ['text or html'],
      optionalFields: ['carrierHint'],
      methods: ['POST']
    },
    { status: 200 }
  );
}