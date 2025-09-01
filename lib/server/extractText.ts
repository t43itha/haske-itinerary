// Conditionally import Node.js-only libraries
let pdf: any;
let simpleParser: any;
let librariesLoaded = false;

// Only import in server environment
if (typeof window === 'undefined') {
  try {
    console.log('🔧 Loading server-side extraction libraries...');
    
    // Load PDF parser
    pdf = require('./pdf-parse-patched.js');
    
    // Load email parser
    const mailparser = require('mailparser');
    simpleParser = mailparser.simpleParser;
    
    // Validate that both libraries loaded correctly
    if (typeof pdf === 'function' && typeof simpleParser === 'function') {
      librariesLoaded = true;
      console.log('✅ All extraction libraries loaded successfully');
    } else {
      console.error('❌ Libraries loaded but not as expected functions:', {
        pdfType: typeof pdf,
        parserType: typeof simpleParser
      });
    }
  } catch (error) {
    console.error('❌ Failed to load server-only libraries:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
  }
} else {
  console.warn('⚠️ Running in browser environment - server libraries not available');
}

export interface ExtractedText {
  text?: string;
  html?: string;
  error?: string;
}

export async function extractText(file: File): Promise<ExtractedText> {
  const fileType = file.type.toLowerCase();
  const fileName = file.name.toLowerCase();
  
  console.log(`📄 Extracting text from file: ${fileName} (${fileType})`);
  
  try {
    // Check if server libraries are available
    if (!librariesLoaded && (fileType === 'application/pdf' || fileName.endsWith('.pdf') || fileType === 'message/rfc822' || fileName.endsWith('.eml'))) {
      return {
        error: 'Server extraction libraries not available. Please check server logs for details.'
      };
    }
    
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      return await extractFromPDF(file);
    }
    
    if (fileType === 'message/rfc822' || fileName.endsWith('.eml')) {
      return await extractFromEML(file);
    }
    
    if (fileType === 'text/html' || fileName.endsWith('.html') || fileName.endsWith('.htm')) {
      return await extractFromHTML(file);
    }
    
    // Fallback: try to read as text
    console.log('📝 Using text fallback for file:', fileName);
    const text = await file.text();
    return { text };
    
  } catch (error) {
    console.error('❌ Text extraction failed:', {
      fileName,
      fileType,
      error: error instanceof Error ? error.message : error
    });
    
    return {
      error: error instanceof Error ? error.message : 'Unknown extraction error'
    };
  }
}

async function extractFromPDF(file: File): Promise<ExtractedText> {
  if (!pdf) {
    return { error: 'PDF parsing library not available' };
  }
  
  console.log(`🔍 Starting PDF extraction for: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log('📖 Parsing PDF content...');
    const data = await pdf(buffer);
    
    if (!data || !data.text) {
      console.warn('⚠️ PDF parsed but no text content found');
      return { error: 'PDF contains no extractable text' };
    }
    
    console.log(`✅ PDF extraction successful: ${data.text.length} characters extracted`);
    return {
      text: data.text
    };
  } catch (error) {
    console.error('❌ PDF extraction failed:', {
      fileName: file.name,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return {
      error: error instanceof Error ? error.message : 'PDF extraction failed'
    };
  }
}

async function extractFromEML(file: File): Promise<ExtractedText> {
  if (!simpleParser) {
    return { error: 'Email parsing library not available' };
  }
  
  console.log(`📧 Starting EML extraction for: ${file.name}`);
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log('📖 Parsing email content...');
    const parsed = await simpleParser(buffer);
  
  let text = '';
  let html = '';
  
  // Extract text content
  if (parsed.text) {
    text = parsed.text;
  }
  
  // Extract HTML content
  if (parsed.html) {
    html = parsed.html as string;
    // Also extract text from HTML if no plain text version
    if (!text) {
      text = stripHtmlTags(html);
    }
  }
  
  // Check for PDF attachments and extract text from them
  if (parsed.attachments && parsed.attachments.length > 0) {
    for (const attachment of parsed.attachments) {
      if (attachment.contentType === 'application/pdf' && attachment.content && pdf) {
        try {
          const pdfData = await pdf(attachment.content);
          text += '\n\n--- PDF Attachment ---\n' + pdfData.text;
        } catch (error) {
          console.warn('Failed to extract PDF attachment:', error);
        }
      }
    }
  }
  
  console.log(`✅ EML extraction successful: ${text.length} chars text, ${html.length} chars HTML`);
  return { text, html };
  } catch (error) {
    console.error('❌ EML extraction failed:', {
      fileName: file.name,
      error: error instanceof Error ? error.message : error
    });
    
    return {
      error: error instanceof Error ? error.message : 'Email extraction failed'
    };
  }
}

async function extractFromHTML(file: File): Promise<ExtractedText> {
  console.log(`🌐 Starting HTML extraction for: ${file.name}`);
  
  try {
    const html = await file.text();
    const text = stripHtmlTags(html);
    
    console.log(`✅ HTML extraction successful: ${text.length} chars text, ${html.length} chars HTML`);
    return { text, html };
  } catch (error) {
    console.error('❌ HTML extraction failed:', {
      fileName: file.name,
      error: error instanceof Error ? error.message : error
    });
    
    return {
      error: error instanceof Error ? error.message : 'HTML extraction failed'
    };
  }
}

function stripHtmlTags(html: string): string {
  // Remove HTML tags and decode entities
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
    .replace(/<[^>]*>/g, ' ') // Remove all HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&') // Decode &amp;
    .replace(/&lt;/g, '<') // Decode &lt;
    .replace(/&gt;/g, '>') // Decode &gt;
    .replace(/&quot;/g, '"') // Decode &quot;
    .replace(/&#39;/g, "'") // Decode &#39;
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

export function extractFromPastedHTML(htmlContent: string): ExtractedText {
  const text = stripHtmlTags(htmlContent);
  return { text, html: htmlContent };
}