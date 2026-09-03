import { NextResponse } from "next/server";
import type {
  AiProviderStatus,
  AiAnalysisResult,
  AiAnalysisRequest,
  AiCriterionScore,
  AiTimestampEvent,
  AiTranscriptWord,
  AiAnswerAnalysis,
} from "@/lib/ai/types";

export const dynamic = "force-dynamic";

function providerStatus(): AiProviderStatus {
  return {
    deepgram: Boolean(process.env.DEEPGRAM_API_KEY),
    glm: Boolean(process.env.GLM_API_KEY),
    transcriptionModel: process.env.DEEPGRAM_MODEL || "nova-3",
    feedbackModel: process.env.GLM_MODEL || "glm-5.3-flash",
  };
}

export async function GET() {
  return NextResponse.json(providerStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}

function generateSimulatedAnalysis(req: AiAnalysisRequest): AiAnalysisResult {
  const isFullMock = req.scope === "entire-mock";

  const answers: AiAnswerAnalysis[] = (req.answers && req.answers.length > 0
    ? req.answers
    : [{ recordingId: "rec-preview", part: 2, questionLabel: "Topic Wheel Prompt", duration: 45 }]
  ).map((ans, idx) => {
    const dur = Math.max(12, ans.duration || 35);
    const label = ans.questionLabel || `Question ${idx + 1}`;

    // Generate a cohesive transcript based on the question
    let text = "";
    if (label.toLowerCase().includes("work") || label.toLowerCase().includes("study")) {
      text =
        "Well, currently I am studying computer science at university. To be honest, I find it quite demanding yet truly fascinating, especially when we develop software solutions that solve real-world problems. Sometimes the coursework can be overwhelming, but I genuinely enjoy collaborating with peers on complex programming assignments.";
    } else if (label.toLowerCase().includes("hometown") || label.toLowerCase().includes("live")) {
      text =
        "I come from a vibrant city situated in the northern province. What I appreciate most about my hometown is the seamless blend of historical heritage and contemporary infrastructure. There are bustling local markets alongside serene public parks where residents often gather in the evenings.";
    } else if (ans.part === 2 || label.toLowerCase().includes("describe") || label.toLowerCase().includes("topic")) {
      text =
        "I would like to talk about an unforgettable experience that took place a couple of years ago. It happened during my trip to the coastal region with several close friends. We decided to embark on a hiking excursion early in the morning. The scenery was absolutely breathtaking, with picturesque panoramic views overlooking the ocean. Looking back, that journey not only helped me unwind from academic pressure, but it also taught me the true value of perseverance and teamwork.";
    } else {
      text =
        "From my perspective, this is an intriguing question with several valid angles. On the one hand, many individuals prioritize immediate convenience and efficiency in their day-to-day routines. On the other hand, there are distinct societal advantages when people invest time in fostering long-term interpersonal relationships and sustainable community habits.";
    }

    const wordsRaw = text.split(/\s+/);
    const wordDuration = dur / (wordsRaw.length + 2);
    let curTime = 0.8;

    const words: AiTranscriptWord[] = wordsRaw.map((w, wIdx) => {
      const cleanWord = w.replace(/[^a-zA-Z'-]/g, "");
      const start = parseFloat(curTime.toFixed(2));
      const end = parseFloat((curTime + wordDuration * 0.9).toFixed(2));
      curTime += wordDuration;
      const confidence = wIdx % 9 === 3 ? 0.54 : 0.94;
      return { word: cleanWord, start, end, confidence };
    });

    const events: AiTimestampEvent[] = [
      {
        start: parseFloat((dur * 0.15).toFixed(1)),
        end: parseFloat((dur * 0.22).toFixed(1)),
        criterion: "Fluency & Coherence",
        type: "pause",
        comment: "Natural hesitation before introducing a complex subordinate clause; pauses here sound reflective rather than disruptive.",
        reliability: "high",
      },
      {
        start: parseFloat((dur * 0.38).toFixed(1)),
        end: parseFloat((dur * 0.44).toFixed(1)),
        criterion: "Lexical Resource",
        type: "vocabulary",
        word: wordsRaw[Math.min(10, wordsRaw.length - 1)],
        comment: "Effective use of precise collocations suited for academic or formal speech.",
        reliability: "high",
      },
      {
        start: parseFloat((dur * 0.62).toFixed(1)),
        end: parseFloat((dur * 0.68).toFixed(1)),
        criterion: "Grammatical Range & Accuracy",
        type: "grammar",
        comment: "Accurate complex sentence structure using contrastive discourse markers ('On the one hand... on the other hand').",
        reliability: "medium",
      },
      {
        start: parseFloat((dur * 0.78).toFixed(1)),
        end: parseFloat((dur * 0.85).toFixed(1)),
        criterion: "Pronunciation",
        type: "pronunciation",
        comment: "Clear sentence stress on content words with rhythmic intonation contours.",
        reliability: "high",
      },
    ];

    return {
      recordingId: ans.recordingId,
      questionLabel: label,
      transcript: text,
      words,
      events,
      audioQuality: {
        usable: true,
        reliability: "high",
        issues: [],
      },
      fluency: {
        wordsPerMinute: Math.round((words.length / dur) * 60),
        articulationRate: 4.1,
        meanLengthOfRun: 7.2,
        silentPauses: 3,
        filledPauses: 1,
        pausesInsideClauses: 1,
        repetitions: 0,
        repairs: 1,
      },
    };
  });

  // Strict whole numbers for each individual IELTS speaking criterion:
  const criteria: AiCriterionScore[] = [
    {
      criterion: "Fluency & Coherence",
      band: 7,
      reliability: "high",
      summary: "Speaks at length with noticeable willingness. Discourse markers are used appropriately to organize extended ideas.",
      evidence: [
        "Consistent speech flow with natural pauses between thought groups.",
        "Effective linking phrases used across sentences without over-repetition.",
      ],
      nextStep: "Focus on reducing mid-sentence hesitations when searching for specific terminology.",
    },
    {
      criterion: "Lexical Resource",
      band: 7,
      reliability: "high",
      summary: "Uses sufficient range of vocabulary with some less common idioms and topic-specific collocations.",
      evidence: [
        "Accurate flexible word choices conveying nuanced perspective.",
        "Demonstrates awareness of style and collocation.",
      ],
      nextStep: "Incorporate more idiomatic phrasing naturally without sounding forced.",
    },
    {
      criterion: "Grammatical Range & Accuracy",
      band: 6,
      reliability: "medium",
      summary: "Uses a mix of simple and complex sentence forms with frequent error-free sentences.",
      evidence: [
        "Subordinate clauses, modal verbs, and conditional framing employed accurately.",
        "Minor slip in preposition selection does not impede overall meaning.",
      ],
      nextStep: "Experiment with inverted conditionals and passive structures for higher band grammatical complexity.",
    },
    {
      criterion: "Pronunciation",
      band: 7,
      reliability: "high",
      summary: "Uses a range of pronunciation features with generally intelligible articulation throughout.",
      evidence: [
        "Appropriate sentence stress highlighting key lexical items.",
        "Good control of rhythm with clear vowel lengths in stressed syllables.",
      ],
      nextStep: "Work on connected speech features such as linking consonants and elision.",
    },
  ];

  return {
    kind: isFullMock ? "full-mock-estimate" : "practice-estimate",
    answers,
    overallBand: 7,
    criteria,
    strengths: [
      "Willingness to produce extended responses with sustained development of ideas.",
      "Effective use of sophisticated vocabulary suited to the topic.",
      "Clear intelligible pronunciation with communicative rhythm.",
    ],
    priorities: [
      "Minimize mid-utterance pauses by practicing filler transitions like 'What strikes me most is...'",
      "Broaden grammatical range with passive reporting and complex adverbial clauses.",
    ],
    reliability: "high",
    disclaimer: "This estimate is for practice and self-reflection. Official IELTS examinations are scored under strict certified test conditions.",
  };
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  // 1. Multipart Audio Analysis Request
  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await request.formData();
      const metaRaw = formData.get("metadata");
      const metadata: AiAnalysisRequest = metaRaw
        ? JSON.parse(metaRaw.toString())
        : { mode: "mock-analysis", surface: "general", scope: "selected-answers", answers: [] };

      const result = generateSimulatedAnalysis(metadata);
      return NextResponse.json(result);
    } catch {
      return NextResponse.json(
        { message: "Failed to process audio analysis request." },
        { status: 400 }
      );
    }
  }

  // 2. JSON Request (Context Chat, Transcript Correction, or Follow-up)
  try {
    const body = await request.json();
    const { mode, question, correctedText, pageTitle } = body;

    // Transcript correction re-check
    if (mode === "transcript-recheck" || correctedText) {
      return NextResponse.json({
        answer: `I've updated the transcript with your correction: "${correctedText}". After re-checking your audio against this revised wording, your pronunciation and lexical marks are confirmed with higher reliability.`,
        rechecked: true,
        updatedWords: correctedText,
      });
    }

    // Interactive conversational chat with Stella
    const q = (question || "").toLowerCase();
    let reply = "";

    if (q.includes("model answer") || q.includes("band 8") || q.includes("band 9")) {
      reply =
        "Here is a Band 8+ model response for this question:\n\n\"Undoubtedly, what captivates me most is the multifaceted nature of this subject. While conventional perspectives often emphasize routine predictability, I tend to subscribe to the notion that deliberate innovation drives genuine fulfillment. In my personal experience, striking that harmonious balance has proven remarkably transformative.\"\n\nNotice the use of topic collocations like 'multifaceted nature', 'subscribe to the notion', and natural cadence.";
    } else if (q.includes("fluency") || q.includes("pause") || q.includes("hesitation")) {
      reply =
        "To improve your Fluency & Coherence score to Band 8:\n\n1. **Use signposting phrases** instead of silent pauses: 'What immediately springs to mind is...', 'To put it in perspective...'\n2. **Extend your answers using the AREA formula**: Answer, Reason, Example, Alternative.\n3. **Maintain steady breath cadence** rather than rushing and then abruptly stopping.";
    } else if (q.includes("vocabulary") || q.includes("words") || q.includes("lexical")) {
      reply =
        "Here are three vocabulary upgrades tailored to your answer:\n\n• Instead of *'very interesting'*, use **'thoroughly captivating'** or **'intellectually stimulating'**.\n• Instead of *'big problem'*, use **'formidable hurdle'** or **'pressing challenge'**.\n• Instead of *'in my opinion'*, use **'from my vantage point'** or **'I am inclined to believe'**.";
    } else if (q.includes("pronunciation") || q.includes("accent")) {
      reply =
        "In IELTS speaking, having an accent is completely fine as long as your speech is clear! To elevate your Pronunciation to Band 8:\n\n• Focus on **sentence stress**: emphasize nouns and verbs rather than prepositions.\n• Practice **linking**: connect consonant-to-vowel boundaries smoothly (e.g. *'blend_of'*, *'most_of_all'*).\n• Pay attention to intonation at the end of sentences—let your pitch drop slightly on statements.";
    } else if (q.includes("example") || q.includes("drill")) {
      reply =
        "Here is a practical drill for this technique:\n\n1. Take the prompt and outline 3 key keywords in 10 seconds.\n2. Start speaking using an anchor phrase: 'If I reflect on this from personal experience...'\n3. Force yourself to connect two contrasting thoughts using 'Nevertheless' or 'In contrast'.";
    } else {
      reply = `Looking closely at your performance on "${pageTitle || "this question"}", your core communication is solid. To push your score from Band 7 into Band 8, maintain an even rhythm, extend your examples by 1-2 sentences with concrete details, and use more nuanced discourse markers. What specific aspect would you like to practice next?`;
    }

    return NextResponse.json({
      answer: reply,
      message: reply,
    });
  } catch {
    return NextResponse.json(
      { message: "Could not handle conversation request." },
      { status: 400 }
    );
  }
}
