import type { EmailCategory } from "../types/classification";

/**
 * Labeled emails used to measure classifier accuracy (see classificationEval.ts
 * and scripts/evalClassification.ts).
 *
 * The labels are a judgment call, so review them against how YOU want your
 * inbox sorted. Cases tagged "borderline" are deliberately ambiguous; a miss
 * there is informative rather than alarming. When the classifier gets a real
 * email wrong, add it here (anonymized) so the mistake stays visible.
 */
export type LabeledEmail = {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  expected: EmailCategory;
  note?: string;
};

const TO = "me@example.com";

export const CLASSIFICATION_FIXTURES: LabeledEmail[] = [
  /* ── SPAM ── */
  {
    id: "spam-1",
    from: "claims@win-prizes-now.biz",
    to: TO,
    subject: "Congratulations!! You won a $1,000 gift card",
    body: "You have been selected! Claim your $1,000 gift card in the next 24 hours. Reply with your full name, address and card number to receive your prize.",
    expected: "SPAM",
  },
  {
    id: "spam-2",
    from: "invest@btc-multiplier.io",
    to: TO,
    subject: "Double your Bitcoin in 48 hours - guaranteed",
    body: "Our private trading bot guarantees 100% returns in two days. Send any amount of crypto to the wallet below. Limited spots left, act now!",
    expected: "SPAM",
  },
  {
    id: "spam-3",
    from: "security@paypa1-support.com",
    to: TO,
    subject: "Your account is suspended - verify immediately",
    body: "We noticed unusual activity. Your account will be permanently closed unless you confirm your password and card details using the secure form.",
    expected: "SPAM",
    note: "phishing",
  },
  {
    id: "spam-4",
    from: "sales@cheap-meds-online.net",
    to: TO,
    subject: "No prescription needed - 90% off",
    body: "Order strong medication without a prescription. Discreet shipping worldwide. Buy now and get a free sample pack.",
    expected: "SPAM",
  },
  {
    id: "spam-5",
    from: "ranker@seo-boost-pro.xyz",
    to: TO,
    subject: "Rank #1 on Google in 7 days, guaranteed",
    body: "Hello owner, I visited your website and it is not on page one. We will get you thousands of backlinks for only $49. Reply YES to start.",
    expected: "SPAM",
    note: "unsolicited cold promotion",
  },

  /* ── LOW_PRIORITY ── */
  {
    id: "low-1",
    from: "deals@fashionstore.com",
    to: TO,
    subject: "Weekend sale: 20% off everything",
    body: "Our weekend sale is on. Enjoy 20% off new arrivals and free shipping over $50. Shop the collection in store or online.",
    expected: "LOW_PRIORITY",
    note: "marketing from a store the user subscribed to",
  },
  {
    id: "low-2",
    from: "notifications@socialnetwork.com",
    to: TO,
    subject: "5 people viewed your profile this week",
    body: "See who has been looking at your profile. Upgrade to premium to find out more about your visitors.",
    expected: "LOW_PRIORITY",
  },
  {
    id: "low-3",
    from: "hello@notesapp.io",
    to: TO,
    subject: "3 tips to get more out of Notes",
    body: "Did you know you can pin notes, add tags and share folders? Here are three quick tips to make the most of your account.",
    expected: "LOW_PRIORITY",
  },
  {
    id: "low-4",
    from: "digest@readingplatform.com",
    to: TO,
    subject: "Top stories for you this week",
    body: "Here are the most popular stories in topics you follow: remote work, personal finance, and productivity. Read more on the app.",
    expected: "LOW_PRIORITY",
  },
  {
    id: "low-5",
    from: "feedback@onlinestore.com",
    to: TO,
    subject: "How was your recent purchase?",
    body: "Thanks for shopping with us. Tell us how we did by answering a two-minute survey. Your feedback helps us improve.",
    expected: "LOW_PRIORITY",
    note: "borderline: could be read as INFORMATIONAL",
  },

  /* ── INFORMATIONAL ── */
  {
    id: "info-1",
    from: "shipping@onlinestore.com",
    to: TO,
    subject: "Your order #88213 has shipped",
    body: "Good news, your order is on its way. Carrier: BlueDart. Tracking number: BD9988776655. Estimated delivery: Thursday.",
    expected: "INFORMATIONAL",
  },
  {
    id: "info-2",
    from: "no-reply@bank.example",
    to: TO,
    subject: "Your monthly statement is ready",
    body: "Your September statement is now available in net banking. No action is required. Statements are kept for seven years.",
    expected: "INFORMATIONAL",
  },
  {
    id: "info-3",
    from: "notifications@github.com",
    to: TO,
    subject: "[repo] Pull request #142 was merged",
    body: "Your pull request 'Fix draft status handling' was merged into main by a maintainer. The branch can now be deleted.",
    expected: "INFORMATIONAL",
  },
  {
    id: "info-4",
    from: "status@cloudhost.example",
    to: TO,
    subject: "Scheduled maintenance this Sunday 2-4am",
    body: "We will perform scheduled maintenance on Sunday between 2am and 4am. Brief interruptions are possible. No action is needed from you.",
    expected: "INFORMATIONAL",
  },
  {
    id: "info-5",
    from: "billing@streaming.example",
    to: TO,
    subject: "Receipt: your subscription renewed",
    body: "Your annual plan renewed today. Amount charged: $59.99 to the card ending 4242. A copy of this receipt is attached.",
    expected: "INFORMATIONAL",
  },

  /* ── REQUIRES_REPLY ── */
  {
    id: "reply-1",
    from: "priya@partnerco.example",
    to: TO,
    subject: "Q3 numbers",
    body: "Hi, could you send me the Q3 revenue numbers by Friday? I need them for the board pack. Thanks!",
    expected: "REQUIRES_REPLY",
  },
  {
    id: "reply-2",
    from: "recruiter@talentfirm.example",
    to: TO,
    subject: "Quick question about your availability",
    body: "Hi, I came across your profile. Are you open to new roles right now, and could you share your expected salary range? Looking forward to hearing back.",
    expected: "REQUIRES_REPLY",
  },
  {
    id: "reply-3",
    from: "accounts@clientco.example",
    to: TO,
    subject: "Invoice question",
    body: "Hi, which PO number should we put on invoice 2231? Our finance team needs it before they can process payment. Please let me know.",
    expected: "REQUIRES_REPLY",
  },
  {
    id: "reply-4",
    from: "sam.friend@mail.example",
    to: TO,
    subject: "Are you coming?",
    body: "Hey! Are you coming to the wedding on the 25th? I need to give the caterer a headcount by Monday so please confirm either way.",
    expected: "REQUIRES_REPLY",
  },
  {
    id: "reply-5",
    from: "manager@mycompany.example",
    to: TO,
    subject: "Contract draft",
    body: "Please review the attached contract draft and confirm you are happy with section 4 before it goes to legal tomorrow.",
    expected: "REQUIRES_REPLY",
    note: "borderline: could be IMPORTANT",
  },

  /* ── MEETING ── */
  {
    id: "meet-1",
    from: "calendar@company.example",
    to: TO,
    subject: "Invitation: Project sync @ Tue 3:00pm",
    body: "You have been invited to Project sync on Tuesday at 3:00pm - 3:30pm. Join with the video link. Accept, decline, or propose a new time.",
    expected: "MEETING",
  },
  {
    id: "meet-2",
    from: "hr@hiringco.example",
    to: TO,
    subject: "Interview slots - please pick one",
    body: "Thank you for applying. We would like to interview you. We have availability on Wednesday at 11am, Thursday at 2pm or Friday at 10am. Which works best?",
    expected: "MEETING",
    note: "scheduling beats generic reply",
  },
  {
    id: "meet-3",
    from: "dana@partnerco.example",
    to: TO,
    subject: "Roadmap chat",
    body: "Could we find 30 minutes next week to go through the roadmap? I'm free Tuesday or Wednesday afternoon.",
    expected: "MEETING",
  },
  {
    id: "meet-4",
    from: "reception@dentalclinic.example",
    to: TO,
    subject: "Appointment rescheduled to Oct 12, 10:30am",
    body: "Your appointment has been moved to October 12 at 10:30am. Please reply to confirm or call us to choose another time.",
    expected: "MEETING",
  },
  {
    id: "meet-5",
    from: "alex@startup.example",
    to: TO,
    subject: "Link for tomorrow's 10am call",
    body: "Here is the video link for our call tomorrow at 10am. Looking forward to catching up on the proposal.",
    expected: "MEETING",
  },

  /* ── IMPORTANT ── */
  {
    id: "imp-1",
    from: "accounts@supplier.example",
    to: TO,
    subject: "FINAL NOTICE: invoice 4412 overdue",
    body: "Invoice 4412 for $8,400 is 45 days overdue. Unless payment is received by October 10 your service will be suspended and the account referred to collections.",
    expected: "IMPORTANT",
  },
  {
    id: "imp-2",
    from: "notices@taxauthority.example",
    to: TO,
    subject: "Notice regarding your assessment year 2025-26",
    body: "A notice has been issued against your return. You must file a response on the portal within 15 days or a penalty may apply.",
    expected: "IMPORTANT",
  },
  {
    id: "imp-3",
    from: "security@accounts.example",
    to: TO,
    subject: "Security alert: new sign-in from an unknown device",
    body: "We detected a sign-in to your account from a new device in another country. If this was not you, secure your account immediately.",
    expected: "IMPORTANT",
    note: "borderline: could be INFORMATIONAL",
  },
  {
    id: "imp-4",
    from: "landlord@propertymgmt.example",
    to: TO,
    subject: "Lease renewal terms - signature needed by Oct 20",
    body: "The renewal terms for your lease are attached. Rent increases 8% from December. The signed copy must reach us by October 20 or the lease will lapse.",
    expected: "IMPORTANT",
    note: "borderline: could be REQUIRES_REPLY",
  },
  {
    id: "imp-5",
    from: "admissions@university.example",
    to: TO,
    subject: "Action required: scholarship documents",
    body: "Your scholarship will be forfeited unless the missing documents are uploaded before October 15. Please review the attached checklist carefully.",
    expected: "IMPORTANT",
  },
];
