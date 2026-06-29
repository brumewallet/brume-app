/**
 * Legal content for the Terms of Service and Privacy Policy pages.
 *
 * ⚠️  DRAFT TEMPLATE: NOT LEGAL ADVICE.
 * Before publishing, have counsel review, and replace every placeholder below:
 *   - company.legalEntity   (registered contracting entity)
 *   - company.address       (registered business address)
 *   - company.governingLaw  (chosen jurisdiction)
 *   - effectiveDate / version on each document
 *   - confirm email addresses resolve (legal@, privacy@, hello@)
 * Items marked "[verify]" depend on facts only you can confirm
 * (e.g. whether analytics run, which sub-processors are live, EU representative).
 */

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "subheading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; text: string };

export interface LegalSection {
  id: string;
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  slug: "terms" | "privacy";
  label: string;
  title: string;
  effectiveDate: string;
  version: string;
  summary: string;
  sections: LegalSection[];
}

export const company = {
  product: "Brume",
  // TODO: replace with the registered contracting entity name.
  legalEntity: "Brume Labs",
  site: "brume.cash",
  legalEmail: "legal@brume.cash",
  privacyEmail: "privacy@brume.cash",
  supportEmail: "hello@brume.cash",
  // TODO: add the registered business address.
  address: "Registered address available on request",
  // TODO: confirm the governing-law jurisdiction with counsel.
  governingLaw: "the State of Delaware, United States",
} as const;

export const LAST_UPDATED = "June 16, 2026";

export const terms: LegalDoc = {
  slug: "terms",
  label: "Terms of Service",
  title: "Terms of Service",
  effectiveDate: LAST_UPDATED,
  version: "1.0",
  summary:
    "These terms govern your use of Brume, a self-custodial Solana wallet and the related website and services. Brume is experimental software. Read these terms, and the risk notices in them, before you use it.",
  sections: [
    {
      id: "acceptance",
      heading: "1. Acceptance of these terms",
      blocks: [
        {
          type: "p",
          text: `These Terms of Service ("Terms") are a binding agreement between you and ${company.legalEntity} ("${company.product}", "we", "us"). They apply to the Brume browser extension, the brume.cash website, our APIs, and any related services (together, the "Service").`,
        },
        {
          type: "p",
          text: "By installing, accessing, or using the Service, you agree to these Terms and to our Privacy Policy, which is incorporated here by reference. If you do not agree, do not use the Service.",
        },
        {
          type: "callout",
          text: "Brume is non-audited, experimental software provided for development and personal use. Do not place funds in it that you cannot afford to lose.",
        },
      ],
    },
    {
      id: "eligibility",
      heading: "2. Eligibility",
      blocks: [
        {
          type: "p",
          text: "To use the Service you must be at least 18 years old (or the age of majority where you live) and able to form a binding contract.",
        },
        {
          type: "list",
          items: [
            "You are not located in, and are not a resident of, any country or region subject to comprehensive sanctions or embargoes.",
            "You are not on any government list of prohibited or restricted parties.",
            "If you use the Service on behalf of an organization, you have authority to bind that organization to these Terms.",
          ],
        },
      ],
    },
    {
      id: "self-custody",
      heading: "3. Self-custody and your responsibility",
      blocks: [
        {
          type: "callout",
          text: "Brume is self-custodial. We never hold, access, or control your private keys, seed phrase, password, or funds. They are generated and stored on your device, encrypted, and never sent to us.",
        },
        {
          type: "p",
          text: "Because we have no access to your keys, we cannot recover, reset, freeze, reverse, or otherwise help you regain access to your wallet or assets. You are solely responsible for:",
        },
        {
          type: "list",
          items: [
            "Securely backing up your seed phrase and remembering your password.",
            "Keeping your device, browser, and seed phrase free from malware, phishing, and unauthorized access.",
            "Verifying every transaction, address, and approval before you confirm it.",
          ],
        },
        {
          type: "p",
          text: "If you lose your seed phrase or password, your funds are permanently unrecoverable. Transactions on the blockchain cannot be undone.",
        },
      ],
    },
    {
      id: "acceptable-use",
      heading: "4. Acceptable use",
      blocks: [
        {
          type: "p",
          text: "You agree to use the Service only for lawful purposes and in compliance with all applicable laws, including anti-money-laundering and sanctions laws. You must not:",
        },
        {
          type: "list",
          items: [
            "Engage in illegal activity, fraud, money laundering, sanctions evasion, or market manipulation.",
            "Distribute malware, run phishing, or attempt to bypass security controls.",
            "Access the Service without authorization, scrape it, or evade rate limits.",
            "Infringe intellectual property rights or circumvent technical protections.",
            "Harass, abuse, or harm others, or post hateful or abusive content.",
            "Interfere with or disrupt the availability or integrity of the Service.",
          ],
        },
      ],
    },
    {
      id: "agents",
      heading: "5. Agentic payments and automation",
      blocks: [
        {
          type: "p",
          text: "Brume lets you authorize policy-bound agents to act on your behalf within rules you define, such as spending limits, approval thresholds, and allowlists.",
        },
        {
          type: "list",
          items: [
            "Agents are your tools. You define the policy, and you are responsible for every transaction an agent executes within the limits you set.",
            "You can revoke an agent's access at any time. Revocation applies going forward and does not reverse transactions already submitted.",
            "We do not guarantee the behavior, performance, or outcomes of any agent, automation, or third-party logic you connect.",
            "Review an agent's permissions and limits carefully before enabling it.",
          ],
        },
      ],
    },
    {
      id: "blockchain-risks",
      heading: "6. Blockchain transactions and risks",
      blocks: [
        {
          type: "p",
          text: "The Service interacts with the Solana blockchain and other decentralized networks that we do not own or control. You acknowledge and accept the following risks:",
        },
        {
          type: "list",
          items: [
            "Transactions are irreversible once submitted, and may fail, be delayed, or be reordered by the network.",
            "Network (gas) and protocol fees are paid to validators and third parties, not to us, and are non-refundable.",
            "Digital assets are volatile and may lose value. We provide no financial, investment, legal, or tax advice.",
            "Smart contracts and third-party dApps you interact with carry their own risks, including bugs and exploits.",
            "Privacy features reduce but may not fully eliminate on-chain or network-level metadata. See our Privacy Policy.",
            "Laws and regulations affecting digital assets are evolving and may change how, or whether, you can use the Service.",
          ],
        },
      ],
    },
    {
      id: "third-parties",
      heading: "7. Third-party services",
      blocks: [
        {
          type: "p",
          text: "The Service relies on, and lets you connect to, third parties such as RPC and data providers, decentralized applications, and integrations. We do not control and are not responsible for third-party services, and linking to or integrating with them is not an endorsement. Your use of them is governed by their own terms.",
        },
      ],
    },
    {
      id: "ip",
      heading: "8. Intellectual property",
      blocks: [
        {
          type: "p",
          text: `The ${company.product} name, logo, software, and the design of the Service are our property and are protected by intellectual property laws. Any third-party components are licensed under their respective licenses, which govern your use of that code.`,
        },
        {
          type: "p",
          text: "We grant you a limited, personal, non-exclusive, non-transferable, revocable license to use the Service for its intended purpose. If you send us feedback or suggestions, you grant us a perpetual, royalty-free license to use them without obligation to you.",
        },
      ],
    },
    {
      id: "fees",
      heading: "9. Fees",
      blocks: [
        {
          type: "p",
          text: "The Brume wallet is currently free to use. Blockchain network fees are charged by the network, not by us. We do not take custody of your funds. If we introduce paid features in the future, we will disclose the pricing and terms before you are charged.",
        },
      ],
    },
    {
      id: "termination",
      heading: "10. Termination and suspension",
      blocks: [
        {
          type: "p",
          text: "You may stop using the Service at any time by uninstalling the extension. We may suspend or limit access to our hosted services (such as our APIs) if we reasonably believe you have violated these Terms, or to protect the Service, other users, or to comply with law.",
        },
        {
          type: "p",
          text: "Because Brume is self-custodial, ending your use of the Service does not affect your keys or on-chain assets, which remain yours and under your control. Sections that by their nature should survive termination will survive, including intellectual property, disclaimers, limitation of liability, indemnification, and dispute resolution.",
        },
      ],
    },
    {
      id: "disclaimers",
      heading: "11. Disclaimers",
      blocks: [
        {
          type: "p",
          text: 'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED BY LAW.',
        },
        {
          type: "p",
          text: "We do not warrant that the Service will be uninterrupted, secure, or error-free, that privacy features will defeat all forms of analysis, or that data obtained through the Service (including balances, prices, or activity from third-party sources) is accurate or complete.",
        },
      ],
    },
    {
      id: "liability",
      heading: "12. Limitation of liability",
      blocks: [
        {
          type: "p",
          text: "TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOSS OF DATA, PROFITS, REVENUE, OR DIGITAL ASSETS, INCLUDING LOSSES FROM LOST KEYS, FAILED OR IRREVERSIBLE TRANSACTIONS, AGENT-EXECUTED TRANSACTIONS, OR THIRD-PARTY OR NETWORK FAILURES.",
        },
        {
          type: "p",
          text: "OUR TOTAL LIABILITY FOR ANY CLAIM SHALL NOT EXCEED THE GREATER OF THE AMOUNTS YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM, OR USD 100. THESE LIMITS DO NOT APPLY TO LIABILITY FOR DEATH OR PERSONAL INJURY, FRAUD, OR WILLFUL MISCONDUCT, OR WHERE THEY ARE PROHIBITED BY LAW.",
        },
      ],
    },
    {
      id: "indemnification",
      heading: "13. Indemnification",
      blocks: [
        {
          type: "p",
          text: "You agree to indemnify and hold us harmless from any claims, damages, losses, and expenses (including reasonable legal fees) arising out of your use of the Service, your transactions, your content, your violation of these Terms or applicable law, or your infringement of any third party's rights.",
        },
      ],
    },
    {
      id: "disputes",
      heading: "14. Governing law and dispute resolution",
      blocks: [
        {
          type: "p",
          text: `These Terms are governed by the laws of ${company.governingLaw}, without regard to conflict-of-laws rules.`,
        },
        {
          type: "p",
          text: "Before filing a claim, you agree to try to resolve the dispute informally by contacting us. If we cannot resolve it within 30 days, disputes will be settled by binding arbitration on an individual basis, and you and we waive the right to participate in a class action.",
        },
        {
          type: "list",
          items: [
            "You may instead bring an individual claim in small-claims court if it qualifies.",
            "If you are a consumer in the EU, UK, or another region with mandatory protections, nothing here removes rights or remedies that the law guarantees you, including the right to bring proceedings in your local courts.",
          ],
        },
      ],
    },
    {
      id: "changes",
      heading: "15. Changes to these terms",
      blocks: [
        {
          type: "p",
          text: "We may update these Terms from time to time. If we make material changes, we will update the effective date above and, where appropriate, provide notice. Your continued use of the Service after changes take effect means you accept the updated Terms.",
        },
      ],
    },
    {
      id: "general",
      heading: "16. General",
      blocks: [
        {
          type: "list",
          items: [
            "These Terms and the Privacy Policy are the entire agreement between you and us regarding the Service.",
            "If any provision is held unenforceable, the rest remains in effect.",
            "Our failure to enforce a provision is not a waiver of it.",
            "You may not assign these Terms; we may assign them in connection with a merger, acquisition, or sale of assets.",
            "We are not liable for delays or failures caused by events beyond our reasonable control.",
          ],
        },
      ],
    },
    {
      id: "contact",
      heading: "17. Contact",
      blocks: [
        {
          type: "p",
          text: `Questions about these Terms? Contact us at ${company.legalEmail}.`,
        },
      ],
    },
  ],
};

export const privacy: LegalDoc = {
  slug: "privacy",
  label: "Privacy Policy",
  title: "Privacy Policy",
  effectiveDate: LAST_UPDATED,
  version: "1.0",
  summary:
    "Privacy is the point of Brume. This policy explains the little data we do process for the website, waitlist, and APIs, what we deliberately never collect, and the rights you have over your data.",
  sections: [
    {
      id: "overview",
      heading: "1. Overview and scope",
      blocks: [
        {
          type: "p",
          text: `This policy describes how ${company.legalEntity} ("${company.product}", "we", "us") handles personal data across the brume.cash website, the waitlist, our APIs, and the Brume browser extension. Brume is designed to be local-first and self-custodial, so we process as little personal data as possible.`,
        },
      ],
    },
    {
      id: "controller",
      heading: "2. Who we are",
      blocks: [
        {
          type: "p",
          text: `${company.legalEntity} is the controller of the limited personal data described here. You can reach us about privacy at ${company.privacyEmail}.`,
        },
        {
          type: "p",
          text: "[verify] If we are required to appoint an EU/UK representative or Data Protection Officer, their details will be listed here.",
        },
      ],
    },
    {
      id: "not-collected",
      heading: "3. What we never collect",
      blocks: [
        {
          type: "callout",
          text: "We do not collect your private keys, seed phrase, or wallet password. They are generated and stored, encrypted, on your device and are never transmitted to us. We cannot see them, and we cannot recover them.",
        },
      ],
    },
    {
      id: "collected",
      heading: "4. Information we process",
      blocks: [
        { type: "subheading", text: "Wallet data (on your device)" },
        {
          type: "p",
          text: "Your encrypted keystore, accounts, and settings are stored locally in your browser. This data stays on your device and is not sent to us.",
        },
        { type: "subheading", text: "API request data" },
        {
          type: "p",
          text: "When the wallet queries our APIs (for portfolio, activity, or token metadata), we process the public wallet address you look up and standard request metadata such as IP address, timestamp, and user agent. We use this to return results, prevent abuse, and apply rate limits. We do not link wallet addresses to real-world identities.",
        },
        { type: "subheading", text: "Waitlist" },
        {
          type: "p",
          text: "If you join the waitlist, we process the email address you submit so we can notify you about the launch.",
        },
        { type: "subheading", text: "Support and analytics" },
        {
          type: "p",
          text: "If you email us, we process your message and contact details to respond. [verify] If we run website analytics, we use privacy-respecting, aggregate measurement that does not identify you; we do not use advertising trackers.",
        },
      ],
    },
    {
      id: "use",
      heading: "5. How we use information",
      blocks: [
        {
          type: "list",
          items: [
            "Operate, maintain, and secure the Service.",
            "Prevent abuse, fraud, and excessive use through rate limiting.",
            "Respond to your questions and support requests.",
            "Send you a launch notification if you joined the waitlist.",
            "Comply with legal obligations and enforce our Terms.",
          ],
        },
      ],
    },
    {
      id: "legal-bases",
      heading: "6. Legal bases (GDPR)",
      blocks: [
        {
          type: "list",
          items: [
            "Consent, for the waitlist email. You can withdraw it at any time.",
            "Legitimate interests, for operating and securing the Service and preventing abuse.",
            "Contract, to provide the parts of the Service you request.",
            "Legal obligation, where the law requires us to process data.",
          ],
        },
      ],
    },
    {
      id: "sharing",
      heading: "7. How we share information",
      blocks: [
        {
          type: "p",
          text: "We share data only with service providers that help us run the Service, and only as needed:",
        },
        {
          type: "list",
          items: [
            "RPC and blockchain data providers (for example, Helius and Solana RPC providers) to read on-chain data.",
            "Hosting and database infrastructure (for example, Supabase) to run our APIs.",
            "[verify] An email provider, if we use one to manage the waitlist.",
            "Authorities or others where required by law, or to protect rights, safety, and the integrity of the Service.",
            "A successor entity in connection with a merger, acquisition, or sale of assets.",
          ],
        },
        {
          type: "callout",
          text: "We do not sell your personal information, and we do not share it for cross-context behavioral advertising.",
        },
      ],
    },
    {
      id: "blockchain",
      heading: "8. Blockchain transparency",
      blocks: [
        {
          type: "callout",
          text: "Transactions you broadcast are recorded on public blockchains. That data is permanent, global, and outside our control. We cannot edit or delete on-chain records. Brume's privacy features reduce but may not fully eliminate on-chain or network-level metadata, so consider what you reveal before you transact.",
        },
      ],
    },
    {
      id: "retention",
      heading: "9. Data retention",
      blocks: [
        {
          type: "list",
          items: [
            "API request logs are kept for a short period for security and abuse prevention, then deleted or anonymized.",
            "Waitlist email addresses are kept until you unsubscribe or for a reasonable period after launch.",
            "Support messages are kept only as long as needed to handle your request.",
            "Your local keystore stays on your device until you remove it. We cannot delete it for you.",
          ],
        },
      ],
    },
    {
      id: "security",
      heading: "10. Security",
      blocks: [
        {
          type: "p",
          text: "We use reasonable technical measures to protect data, including encryption in transit (TLS) and access controls on our systems. On your device, your keystore is encrypted using key derivation (PBKDF2) and authenticated encryption (AES-GCM).",
        },
        {
          type: "p",
          text: "No system is perfectly secure, and Brume is non-audited development software. You are responsible for the security of your own device and seed phrase.",
        },
      ],
    },
    {
      id: "rights",
      heading: "11. Your rights",
      blocks: [
        {
          type: "p",
          text: "Depending on where you live, you may have some or all of the following rights over your personal data:",
        },
        {
          type: "list",
          items: [
            "Access, correct, delete, or receive a portable copy of your data.",
            "Object to or restrict certain processing, and withdraw consent at any time.",
            "For California residents: know what we collect, delete and correct it, and opt out of sale or sharing. We do not sell or share personal information, and we will not discriminate against you for exercising your rights.",
            "Lodge a complaint with your local data protection authority.",
          ],
        },
        {
          type: "p",
          text: `To exercise these rights, email ${company.privacyEmail}. We may need to verify your request, and we respond within the time the law requires (generally one month under GDPR, 45 days under CCPA). Note that we cannot act on data we do not hold, such as your keys or on-chain transactions.`,
        },
      ],
    },
    {
      id: "transfers",
      heading: "12. International data transfers",
      blocks: [
        {
          type: "p",
          text: "[verify] We and our providers may process data in countries other than yours, including the United States. Where we transfer personal data out of the EU or UK, we rely on appropriate safeguards such as Standard Contractual Clauses.",
        },
      ],
    },
    {
      id: "children",
      heading: "13. Children's privacy",
      blocks: [
        {
          type: "p",
          text: "The Service is not directed to children under 18, and we do not knowingly collect personal data from them. If you believe a child has provided us data, contact us and we will delete it.",
        },
      ],
    },
    {
      id: "changes",
      heading: "14. Changes to this policy",
      blocks: [
        {
          type: "p",
          text: "We may update this policy from time to time. We will update the effective date above and, for material changes, provide notice where appropriate.",
        },
      ],
    },
    {
      id: "contact",
      heading: "15. Contact",
      blocks: [
        {
          type: "p",
          text: `Questions about your privacy? Email us at ${company.privacyEmail}.`,
        },
      ],
    },
  ],
};

export const legalDocs: Record<"terms" | "privacy", LegalDoc> = {
  terms,
  privacy,
};
