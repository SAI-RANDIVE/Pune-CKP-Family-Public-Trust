/**
 * Text of the help pages (/help and the printable /help/quick), in both
 * languages. Kept beside the other translations; same structure in each.
 * Each task: { id, title, href, linkLabel, steps: [text] }.
 */

const mr = {
  tasks: [
    {
      id: 'login', title: 'प्रवेश करणे आणि अक्षर मोठे करणे', href: '/settings/account', linkLabel: 'माझे खाते',
      steps: [
        'आपला ई-मेल किंवा वापरकर्ता नाव आणि पासवर्ड टाकून "प्रवेश करा" दाबा.',
        'पाच वेळा चुकीचा पासवर्ड टाकल्यास खाते १५ मिनिटांसाठी बंद होते. थांबा आणि पुन्हा प्रयत्न करा.',
        'वरच्या पट्टीतील "A+" दाबल्यास अक्षरे मोठी होतात, "A−" दाबल्यास लहान. आपली निवड लक्षात ठेवली जाते.',
        '"English" / "मराठी" बटण दाबून भाषा बदलता येते.',
        'काम झाल्यावर "बाहेर पडा" दाबा, विशेषतः दुसऱ्याच्या संगणकावर.',
      ],
    },
    {
      id: 'donation', title: 'देणगी नोंदवणे', href: '/donations/new', linkLabel: 'नवीन देणगी नोंदवा',
      steps: [
        'मुख्य पृष्ठावरील "नवीन देणगी नोंदवा" दाबा.',
        'कोणी दिली: देणगीदाराचे नाव टाइप करा. यादीत नाव दिसल्यास ते निवडा; नसेल तर "नवीन व्यक्ती म्हणून वापरा" दाबा.',
        'किती रक्कम: रक्कम अंकात लिहा. खाली ती अक्षरात दिसेल, ती वाचून खात्री करा. तारीख आणि प्रकार निवडा.',
        'कशी मिळाली: रोख, धनादेश, UPI इत्यादी निवडा. धनादेश असल्यास त्याचा क्रमांक लिहा.',
        'कशासाठी: निधी, कार्यक्रम किंवा योजना असल्यास निवडा (ऐच्छिक).',
        'शेवटच्या पानावर सर्व माहिती पुन्हा वाचा. बरोबर असल्यास "देणगी जतन करा" दाबा. पावती क्रमांक आपोआप तयार होतो.',
      ],
    },
    {
      id: 'receipt', title: 'पावती शोधणे, छापणे किंवा ई-मेल करणे', href: '/receipts', linkLabel: 'पावती शोधा',
      steps: [
        '"पावती शोधा" दाबा आणि पावती क्रमांक, देणगीदाराचे नाव किंवा रक्कम लिहा.',
        'हवी ती नोंद "उघडा" दाबून उघडा.',
        '"पावती PDF" दाबल्यास पावती उघडते; ती छापता येते.',
        'देणगीदाराचा ई-मेल नोंदलेला असल्यास "ई-मेलने पाठवा" दाबा.',
        'जुन्या वहीतील पावत्यांची PDF नसते; त्यांची मूळ नोंद "हा आकडा कुठून आला?" मध्ये दिसते.',
      ],
    },
    {
      id: 'member', title: 'नवीन सभासद आणि नूतनीकरण', href: '/members', linkLabel: 'सभासद',
      steps: [
        'आधी व्यक्ती शोधा ("व्यक्ती व संस्था") किंवा "नवीन व्यक्ती जोडा" दाबून जोडा.',
        'व्यक्तीच्या पानावर "सभासदत्व द्या" दाबा. श्रेणी (सिल्व्हर, गोल्ड, प्लॅटिनम) आणि सुरुवातीची तारीख निवडा.',
        'प्रणाली शुल्क आणि वैधता दाखवते. मिळालेली रक्कम आणि भरण्याची पद्धत लिहून जतन करा.',
        'नूतनीकरणासाठी: "मुदत संपणारे सभासद" यादी उघडा आणि त्या सभासदासमोर "नूतनीकरण करा" दाबा.',
      ],
    },
    {
      id: 'expense', title: 'खर्च (व्हाउचर) नोंदवणे', href: '/expenses/new', linkLabel: 'खर्च नोंद',
      steps: [
        'मुख्य पृष्ठावरील "खर्च नोंद" दाबा.',
        'तारीख, कोणाला पैसे दिले, कशासाठी आणि खर्चाचा प्रकार निवडा.',
        'रक्कम आणि देण्याची पद्धत लिहा. काही भाग रोख आणि काही बँकेतून दिला असल्यास दोन्ही भाग वेगळे लिहा.',
        'बिलाचा फोटो किंवा PDF जोडता येते (५ MB पर्यंत).',
        'शेवटी सर्व माहिती वाचून "खर्च जतन करा" दाबा.',
      ],
    },
    {
      id: 'fd', title: 'मुदत ठेवी', href: '/deposits', linkLabel: 'मुदत ठेवी',
      steps: [
        '"मुदत ठेवी" मध्ये सर्व ठेवींची नोंदवही दिसते. "मुदतपूर्ती दिनदर्शिका" मध्ये कोणती ठेव कधी संपते ते दिसते.',
        'नवीन ठेव: "नवीन मुदत ठेव" दाबा आणि बँक, रक्कम, व्याजदर, तारखा भरा.',
        'व्याज किंवा TDS नोंदवण्यासाठी ठेव उघडा आणि "व्याज / TDS नोंदवा" भरा.',
        'ठेव संपल्यावर "मुदत पूर्ण" किंवा "बंद" म्हणून नोंदवा; पुन्हा ठेवल्यास "नूतनीकरण करा" दाबा.',
      ],
    },
    {
      id: 'scheme', title: 'योजनेतून दिलेली मदत', href: '/schemes', linkLabel: 'योजना',
      steps: [
        '"योजना" उघडा आणि योजना निवडा.',
        '"मदत नोंदवा" दाबा. लाभार्थी, रक्कम आणि तारीख लिहा.',
        'पैसे प्रत्यक्ष दिले असतील तरच "दिले" निवडा. फक्त ठरले असेल तर "नियोजित" निवडा. नियोजित रक्कम कधीही दिलेल्या रकमेत मोजली जात नाही.',
        'खर्चाचे व्हाउचर वेगळे "खर्च नोंद" मधून नोंदवा.',
      ],
    },
    {
      id: 'search', title: 'काहीही शोधणे', href: '/search', linkLabel: 'शोधा',
      steps: [
        '"शोधा" दाबा आणि नाव (मराठीत किंवा इंग्रजीत), फोन नंबर किंवा कोणताही क्रमांक लिहा.',
        'पूर्ण क्रमांक (उदा. PCFPT/DON/2026-27/0001 किंवा SM/24/173) लिहिल्यास ती नोंद थेट उघडते.',
        'नावाचे स्पेलिंग थोडे चुकले तरी जवळची नावे दिसतात.',
      ],
    },
    {
      id: 'report', title: 'अहवाल पाहणे, छापणे आणि Excel', href: '/reports', linkLabel: 'अहवाल',
      steps: [
        '"अहवाल" उघडा आणि हवा तो अहवाल निवडा.',
        'वर आर्थिक वर्ष निवडून "लागू करा" दाबा.',
        '"छापा" दाबल्यास फक्त अहवाल छापला जातो.',
        '"Excel डाउनलोड" साठी आपल्या ई-मेलवर येणारा ६ अंकी कोड टाकावा लागतो (कोषाध्यक्ष व त्यावरील भूमिकांसाठी).',
      ],
    },
    {
      id: 'review', title: 'तपासणी यादी', href: '/review', linkLabel: 'तपासणी यादी',
      steps: [
        'जुन्या वह्यांमधून माहिती आणताना ज्या नोंदींबद्दल शंका आली त्या येथे आहेत.',
        'प्रकार निवडा, प्रत्येक नोंदीचा पुरावा वाचा.',
        'नोंद बरोबर असल्यास "मान्य", दुरुस्ती झाली असल्यास "निकाली काढले", चुकीची असल्यास "अमान्य" दाबा. अमान्य किंवा निकाली काढताना कारण लिहा.',
        '"एकच व्यक्ती?" यादीत दोन नोंदी शेजारी-शेजारी पाहून त्या एकत्र करा किंवा "एकच नाहीत" दाबा.',
      ],
    },
    {
      id: 'otp', title: 'पडताळणी कोड (OTP) म्हणजे काय?', href: null, linkLabel: null,
      steps: [
        'पैशाची नोंद बदलणे किंवा काढणे, Excel डाउनलोड, व्यक्ती एकत्र करणे, भूमिका बदलणे आणि बॅकअप या कामांसाठी जास्तीची खात्री लागते.',
        'अशा वेळी "कोड पाठवा" दाबा. आपल्या ई-मेलवर ६ अंकी कोड येतो.',
        'तो कोड टाकल्यावर १० मिनिटे ही कामे करता येतात. कोड कोणालाही सांगू नका.',
      ],
    },
    {
      id: 'mistake', title: 'चूक झाली तर', href: null, linkLabel: null,
      steps: [
        'घाबरू नका. कोणतीही नोंद कायमची नष्ट होत नाही; प्रत्येक बदलाची नोंद "बदलांची नोंदवही" मध्ये राहते.',
        'नोंद उघडा आणि "दुरुस्त करा" दाबा (कोड लागेल).',
        'नोंद पूर्ण चुकीची असल्यास सचिव किंवा प्रशासकांना ती काढण्यास सांगा.',
        'फॉर्म अर्धवट राहिला तर तो आपोआप मसुदा म्हणून जतन होतो; पुन्हा उघडल्यावर तिथूनच पुढे जाता येते.',
      ],
    },
  ],
  quick: [
    ['देणगी नोंदवणे', 'मुख्य पृष्ठ → नवीन देणगी नोंदवा → नाव → रक्कम → पद्धत → खात्री → जतन'],
    ['पावती छापणे', 'मुख्य पृष्ठ → पावती शोधा → क्रमांक किंवा नाव → उघडा → पावती PDF'],
    ['खर्च नोंदवणे', 'मुख्य पृष्ठ → खर्च नोंद → तारीख, कोणाला, कशासाठी → रक्कम → खात्री → जतन'],
    ['सभासद नूतनीकरण', 'मुख्य पृष्ठ → सभासद → मुदत संपणारे सभासद → नूतनीकरण करा'],
    ['नवीन सभासद', 'सभासद → व्यक्ती शोधा किंवा जोडा → सभासदत्व द्या → श्रेणी → शुल्क → जतन'],
    ['मुदत ठेव पाहणे', 'मुख्य पृष्ठ → मुदत ठेवी → मुदतपूर्ती दिनदर्शिका'],
    ['काहीही शोधणे', 'वरील "शोधा" → नाव, फोन किंवा क्रमांक'],
    ['अहवाल छापणे', 'मुख्य पृष्ठ → अहवाल → अहवाल निवडा → वर्ष निवडा → छापा'],
    ['अक्षर मोठे करणे', 'वरच्या पट्टीत A+ दाबा'],
    ['भाषा बदलणे', 'वरच्या पट्टीत English / मराठी दाबा'],
    ['मागे जाणे', '"मागे" बटण; कधीही "मुख्य पृष्ठ" दाबल्यास सुरुवातीला परत'],
    ['पडताळणी कोड', 'ई-मेलवर आलेला ६ अंकी कोड टाका; तो १० मिनिटे चालतो; कोणालाही सांगू नका'],
  ],
};

const en = {
  tasks: [
    {
      id: 'login', title: 'Signing in and making the text bigger', href: '/settings/account', linkLabel: 'My account',
      steps: [
        'Type your e-mail or username and your password, then press "Sign in".',
        'After five wrong passwords the account is locked for 15 minutes. Wait, then try again.',
        'Press "A+" in the top bar for bigger text and "A−" for smaller. Your choice is remembered.',
        'Press "English" / "मराठी" to change the language.',
        'Press "Sign out" when you finish, especially on someone else\'s computer.',
      ],
    },
    {
      id: 'donation', title: 'Recording a donation', href: '/donations/new', linkLabel: 'Record a donation',
      steps: [
        'On the home page press "Record a donation".',
        'Who gave it: type the donor\'s name. Pick the name if it appears in the list; if not, press "Use as a new person".',
        'How much: type the amount in figures. It is shown in words underneath; read it to be sure. Choose the date and the type.',
        'How it came: cash, cheque, UPI and so on. For a cheque, type its number.',
        'What for: choose a fund, event or scheme if there is one (optional).',
        'Read everything again on the last screen. If it is right, press "Save donation". The receipt number is created for you.',
      ],
    },
    {
      id: 'receipt', title: 'Finding, printing or e-mailing a receipt', href: '/receipts', linkLabel: 'Find a receipt',
      steps: [
        'Press "Find a receipt" and type the receipt number, the donor\'s name or the amount.',
        'Press "Open" on the entry you want.',
        '"Receipt PDF" opens the receipt, which you can print.',
        'If the donor\'s e-mail is on record, press "Send by e-mail".',
        'Receipts from the old paper books have no PDF; their original entry is under "Where did this number come from?".',
      ],
    },
    {
      id: 'member', title: 'New member and renewal', href: '/members', linkLabel: 'Members',
      steps: [
        'First find the person ("People and organisations") or add them with "Add a person".',
        'On the person\'s page press "Give membership". Choose the tier (Silver, Gold, Platinum) and the start date.',
        'The system shows the fee and the validity. Type the amount received and how it was paid, then save.',
        'To renew: open "Memberships running out" and press "Renew" beside the member.',
      ],
    },
    {
      id: 'expense', title: 'Recording an expense (voucher)', href: '/expenses/new', linkLabel: 'Record an expense',
      steps: [
        'On the home page press "Record an expense".',
        'Choose the date, who was paid, what for, and the head of account.',
        'Type the amount and how it was paid. If part was cash and part from the bank, type the two parts separately.',
        'You can attach a photo or PDF of the bill (up to 5 MB).',
        'Read everything at the end and press "Save expense".',
      ],
    },
    {
      id: 'fd', title: 'Fixed deposits', href: '/deposits', linkLabel: 'Fixed deposits',
      steps: [
        '"Fixed deposits" shows the register. "Maturity calendar" shows which deposit ends when.',
        'New deposit: press "Add a fixed deposit" and fill in the bank, amount, rate and dates.',
        'To record interest or TDS, open the deposit and fill in "Record interest / TDS".',
        'When a deposit ends, mark it "Matured" or "Closed"; if it is placed again, press "Renew".',
      ],
    },
    {
      id: 'scheme', title: 'Help given under a scheme', href: '/schemes', linkLabel: 'Schemes',
      steps: [
        'Open "Schemes" and choose the scheme.',
        'Press "Record help given". Type the beneficiary, the amount and the date.',
        'Choose "Paid" only if the money has actually been given. If it is only decided, choose "Planned". Planned amounts are never counted as paid.',
        'Record the payment voucher separately under "Record an expense".',
      ],
    },
    {
      id: 'search', title: 'Finding anything', href: '/search', linkLabel: 'Search',
      steps: [
        'Press "Search" and type a name (Marathi or English), a phone number or any number.',
        'Typing a full number (such as PCFPT/DON/2026-27/0001 or SM/24/173) opens that record directly.',
        'Close names are shown even if the spelling is slightly off.',
      ],
    },
    {
      id: 'report', title: 'Viewing, printing and exporting reports', href: '/reports', linkLabel: 'Reports',
      steps: [
        'Open "Reports" and choose the report you want.',
        'Choose the financial year at the top and press "Apply".',
        '"Print" prints only the report.',
        '"Download Excel" asks for the 6-digit code sent to your e-mail (Treasurer roles and above).',
      ],
    },
    {
      id: 'review', title: 'Review list', href: '/review', linkLabel: 'Review list',
      steps: [
        'Entries the import from the old books was unsure about are listed here.',
        'Choose a kind and read the evidence for each entry.',
        'Press "Approve" if the entry is right, "Mark resolved" if it has been corrected, "Reject" if it is wrong. Give a reason when rejecting or resolving.',
        'Under "Same person?" compare two records side by side and merge them, or press "Not the same".',
      ],
    },
    {
      id: 'otp', title: 'What is the verification code (OTP)?', href: null, linkLabel: null,
      steps: [
        'Changing or removing a money entry, downloading Excel, merging people, changing roles and backup need an extra check.',
        'Press "Send code". A 6-digit code arrives at your e-mail.',
        'After you type it, those actions are open for 10 minutes. Never tell anyone the code.',
      ],
    },
    {
      id: 'mistake', title: 'If you make a mistake', href: null, linkLabel: null,
      steps: [
        'Do not worry. Nothing is ever destroyed; every change is kept in the "Audit log".',
        'Open the entry and press "Correct" (a code is needed).',
        'If the entry is wholly wrong, ask the Secretary or an administrator to remove it.',
        'A half-filled form is saved as a draft by itself; open it again and carry on from there.',
      ],
    },
  ],
  quick: [
    ['Record a donation', 'Home → Record a donation → name → amount → how paid → check → save'],
    ['Print a receipt', 'Home → Find a receipt → number or name → Open → Receipt PDF'],
    ['Record an expense', 'Home → Record an expense → date, whom, what for → amount → check → save'],
    ['Renew a member', 'Home → Members → Memberships running out → Renew'],
    ['New member', 'Members → find or add the person → Give membership → tier → fee → save'],
    ['See fixed deposits', 'Home → Fixed deposits → Maturity calendar'],
    ['Find anything', '"Search" at the top → name, phone or number'],
    ['Print a report', 'Home → Reports → choose report → choose year → Print'],
    ['Bigger text', 'Press A+ in the top bar'],
    ['Change language', 'Press English / मराठी in the top bar'],
    ['Go back', 'The "Back" button; "Home" always returns to the start'],
    ['Verification code', 'Type the 6-digit code from your e-mail; it lasts 10 minutes; never share it'],
  ],
};

export const HELP = { mr, en };
