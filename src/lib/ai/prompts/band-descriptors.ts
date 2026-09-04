/**
 * Official IELTS Speaking band descriptors.
 *
 * Transcribed verbatim from the public IELTS Speaking Band Descriptors
 * ("Scoring criteria for Academic and General Training tests", ielts.org).
 * Do not paraphrase, shorten or "improve" this wording. The whole point is
 * that Stella judges against the same text a real examiner uses, and a
 * paraphrase quietly changes where the band boundaries sit.
 *
 * WHY THIS IS A SEPARATE FILE, AND A CONSTANT:
 *
 * It is byte-identical on every request and contains no student data, so it
 * sits at the very front of the system prompt where providers can serve it
 * from their prompt cache. Cached input is billed at a fraction of normal
 * input, so the rubric costs almost nothing after the first call of a session.
 * Never interpolate a transcript, a name or a date into this string, or the
 * prefix changes and every request becomes a cache miss.
 *
 * Grouped BY CRITERION rather than by band. When Stella assesses fluency she
 * reads one contiguous 9-to-1 ladder for fluency, which is how an examiner
 * places a performance: find the level whose positive features are fully met.
 */

const FLUENCY_AND_COHERENCE = `FLUENCY AND COHERENCE
9 - Fluent with only very occasional repetition or self-correction. Any hesitation that occurs is used only to prepare the content of the next utterance and not to find words or grammar. Speech is situationally appropriate and cohesive features are fully acceptable. Topic development is fully coherent and appropriately extended.
8 - Fluent with only very occasional repetition or self-correction. Hesitation may occasionally be used to find words or grammar, but most will be content related. Topic development is coherent, appropriate and relevant.
7 - Able to keep going and readily produce long turns without noticeable effort. Some hesitation, repetition and/or self-correction may occur, often mid-sentence and indicate problems with accessing appropriate language. However, these will not affect coherence. Flexible use of spoken discourse markers, connectives and cohesive features.
6 - Able to keep going and demonstrates a willingness to produce long turns. Coherence may be lost at times as a result of hesitation, repetition and/or self-correction. Uses a range of spoken discourse markers, connectives and cohesive features though not always appropriately.
5 - Usually able to keep going, but relies on repetition and self-correction to do so and/or on slow speech. Hesitations are often associated with mid-sentence searches for fairly basic lexis and grammar. Overuse of certain discourse markers, connectives and other cohesive features. More complex speech usually causes disfluency but simpler language may be produced fluently.
4 - Unable to keep going without noticeable pauses. Speech may be slow with frequent repetition. Often self-corrects. Can link simple sentences but often with repetitious use of connectives. Some breakdowns in coherence.
3 - Frequent, sometimes long, pauses occur while candidate searches for words. Limited ability to link simple sentences and go beyond simple responses to questions. Frequently unable to convey basic message.
2 - Lengthy pauses before nearly every word. Isolated words may be recognisable but speech is of virtually no communicative significance.
1 - Essentially none. Speech is totally incoherent.`;

const LEXICAL_RESOURCE = `LEXICAL RESOURCE
9 - Total flexibility and precise use in all contexts. Sustained use of accurate and idiomatic language.
8 - Wide resource, readily and flexibly used to discuss all topics and convey precise meaning. Skilful use of less common and idiomatic items despite occasional inaccuracies in word choice and collocation. Effective use of paraphrase as required.
7 - Resource flexibly used to discuss a variety of topics. Some ability to use less common and idiomatic items and an awareness of style and collocation is evident though inappropriacies occur. Effective use of paraphrase as required.
6 - Resource sufficient to discuss topics at length. Vocabulary use may be inappropriate but meaning is clear. Generally able to paraphrase successfully.
5 - Resource sufficient to discuss familiar and unfamiliar topics but there is limited flexibility. Attempts paraphrase but not always with success.
4 - Resource sufficient for familiar topics but only basic meaning can be conveyed on unfamiliar topics. Frequent inappropriacies and errors in word choice. Rarely attempts paraphrase.
3 - Resource limited to simple vocabulary used primarily to convey personal information. Vocabulary inadequate for unfamiliar topics.
2 - Very limited resource. Utterances consist of isolated words or memorised utterances. Little communication possible without the support of mime or gesture.
1 - No resource bar a few isolated words. No communication possible.`;

const GRAMMATICAL_RANGE_AND_ACCURACY = `GRAMMATICAL RANGE AND ACCURACY
9 - Structures are precise and accurate at all times, apart from 'mistakes' characteristic of native speaker speech.
8 - Wide range of structures, flexibly used. The majority of sentences are error free. Occasional inappropriacies and non-systematic errors occur. A few basic errors may persist.
7 - A range of structures flexibly used. Error-free sentences are frequent. Both simple and complex sentences are used effectively despite some errors. A few basic errors persist.
6 - Produces a mix of short and complex sentence forms and a variety of structures with limited flexibility. Though errors frequently occur in complex structures, these rarely impede communication.
5 - Basic sentence forms are fairly well controlled for accuracy. Complex structures are attempted but these are limited in range, nearly always contain errors and may lead to the need for reformulation.
4 - Can produce basic sentence forms and some short utterances are error-free. Subordinate clauses are rare and, overall, turns are short, structures are repetitive and errors are frequent.
3 - Basic sentence forms are attempted but grammatical errors are numerous except in apparently memorised utterances.
2 - No evidence of basic sentence forms.
1 - No rateable language unless memorised.`;

const PRONUNCIATION = `PRONUNCIATION
9 - Uses a full range of phonological features to convey precise and/or subtle meaning. Flexible use of features of connected speech is sustained throughout. Can be effortlessly understood throughout. Accent has no effect on intelligibility.
8 - Uses a wide range of phonological features to convey precise and/or subtle meaning. Can sustain appropriate rhythm. Flexible use of stress and intonation across long utterances, despite occasional lapses. Can be easily understood throughout. Accent has minimal effect on intelligibility.
7 - Displays all the positive features of band 6, and some, but not all, of the positive features of band 8.
6 - Uses a range of phonological features, but control is variable. Chunking is generally appropriate, but rhythm may be affected by a lack of stress-timing and/or a rapid speech rate. Some effective use of intonation and stress, but this is not sustained. Individual words or phonemes may be mispronounced but this causes only occasional lack of clarity. Can generally be understood throughout without much effort.
5 - Displays all the positive features of band 4, and some, but not all, of the positive features of band 6.
4 - Uses some acceptable phonological features, but the range is limited. Produces some acceptable chunking, but there are frequent lapses in overall rhythm. Attempts to use intonation and stress, but control is limited. Individual words or phonemes are frequently mispronounced, causing lack of clarity. Understanding requires some effort and there may be patches of speech that cannot be understood.
3 - Displays some features of band 2, and some, but not all, of the positive features of band 4.
2 - Uses few acceptable phonological features (possibly because sample is insufficient). Overall problems with delivery impair attempts at connected speech. Individual words and phonemes are mainly mispronounced and little meaning is conveyed.
1 - Can produce occasional individual words and phonemes that are recognisable, but no overall meaning is conveyed. Unintelligible.`;

/**
 * The official notes printed under the descriptor table, plus the rules that
 * follow from the fact that Stella reads a transcript rather than hearing the
 * candidate.
 */
const RATING_RULES = `HOW TO APPLY THESE DESCRIPTORS

Official notes from the descriptor table:
(i) A candidate must fully fit the positive features of the descriptor at a particular level.
(ii) A candidate is rated on their average performance across all parts of the test.

Note (i) is the rule that matters most. Do not award a band because the
candidate is "close to it" or because it feels encouraging. If they do not
fully meet every positive feature at that level, the band is the one below.
Work downwards: start at 9 and stop at the first level whose positive features
are all genuinely present in the evidence.

WHOLE BANDS ONLY. Every criterion score is an integer from 1 to 9. Never
output 5.5, 6.5, or any decimal for a criterion. The descriptor table has no
half levels, so a half score would mean nothing. If a performance sits between
two levels, note (i) decides it: award the LOWER band, then use the feedback to
explain exactly which features of the higher band are missing. That explanation
is what actually helps the candidate, not a decimal.

WHAT YOU CAN AND CANNOT HEAR. You receive a written transcript produced by
speech recognition. You never hear the audio. This has hard consequences:

- Fluency and coherence: assess from evidence present in the text, such as
  repetition, self-correction, restarts, filler words, abandoned sentences and
  coherence of topic development. Where pause timings are supplied, use them.
  Do not invent a speech rate you cannot observe.
- Lexical resource and Grammatical range and accuracy: these are fully
  assessable from a transcript. Be rigorous here.
- Pronunciation: you CANNOT assess phonemes, stress, rhythm, intonation or
  accent from text. Never claim a candidate mispronounced a specific word.
  Give your least confident judgement here, base it only on defensible textual
  signals, mark its reliability as low, and say plainly that a reliable
  pronunciation score needs a human examiner. Inventing pronunciation feedback
  is the single most misleading thing you could do to a candidate.

A transcription error is not a candidate error. Speech recognition mishears
words. If an oddity looks like a recognition artefact rather than something a
learner would say, ignore it rather than penalising the candidate for it.

SAMPLE SIZE. Note (ii) refers to average performance across the whole test. A
single short Part 1 answer is thin evidence. Score what is in front of you, but
say how limited the sample is, and never present a band from one short answer
as a predicted overall test result.`;

/**
 * Full rubric block. Static, student-free, and safe to place at the front of
 * the system prompt.
 */
export const IELTS_BAND_DESCRIPTORS = [
  "OFFICIAL IELTS SPEAKING BAND DESCRIPTORS",
  "These are the public IELTS descriptors. They are your only source of truth",
  "for a band score. Quote and reason from them; do not substitute your own",
  "impression of what a band sounds like.",
  "",
  FLUENCY_AND_COHERENCE,
  "",
  LEXICAL_RESOURCE,
  "",
  GRAMMATICAL_RANGE_AND_ACCURACY,
  "",
  PRONUNCIATION,
  "",
  RATING_RULES,
].join("\n");

/** Band 0 is an administrative outcome, not a language judgement. */
export const BAND_ZERO_NOTE =
  "Band 0 means the candidate did not attend or did not complete the test. " +
  "It is never awarded for weak language. The lowest language band is 1.";

/** The four criteria, in the official order used by the descriptor table. */
export const IELTS_CRITERION_NAMES = [
  "Fluency and coherence",
  "Lexical resource",
  "Grammatical range and accuracy",
  "Pronunciation",
] as const;

export const MIN_BAND = 1;
export const MAX_BAND = 9;

/**
 * Overall speaking band, computed in code rather than asked of the model.
 *
 * IELTS averages the four equally weighted criteria and reports to the nearest
 * half band. This is arithmetic, so it should not be delegated to a language
 * model that might round in the candidate's favour. Note that the overall CAN
 * legitimately end in .5 even though no individual criterion ever does — that
 * is exactly how a real test report works, and matching it is what keeps our
 * score comparable to the real thing.
 */
export function overallSpeakingBand(criterionBands: number[]): number {
  if (criterionBands.length === 0) {
    throw new Error("Cannot compute an overall band with no criterion scores.");
  }
  const mean =
    criterionBands.reduce((total, band) => total + band, 0) /
    criterionBands.length;
  return Math.round(mean * 2) / 2;
}
