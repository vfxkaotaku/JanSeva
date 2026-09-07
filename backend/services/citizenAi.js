/**
 * JANSEVA.AI — Open Source Citizen AI Engine
 * 100% Free, Zero-API-Key required, instant offline/online intelligence.
 * Covers all major Indian central & state welfare schemes in Hindi, Marathi, and English.
 */

const SCHEMES_DATABASE = [
  {
    id: 'identity',
    triggers: ['name', 'naam', 'nav', 'who are you', 'kon ahes', 'kaun ho', 'tumhi kon', 'aap kaun', 'kya naam', 'kay ahe', 'aapka naam'],
    hi: {
      title: 'JANSEVA.AI (जनसेवा डिजिटल सहायक)',
      benefit: 'भारत सरकार और राज्य सरकारों की 500+ जन कल्याणकारी योजनाओं की सटीक व त्वरित जानकारी।',
      eligibility: 'भारत का प्रत्येक नागरिक।',
      docs: 'किसी दस्तावेज़ की आवश्यकता नहीं — सीधे प्रश्न पूछें या माइक से बोलें।',
      portal: 'janseva.gov.in / UMANG App / नजदीकी सीएससी (जन सेवा केंद्र)'
    },
    mr: {
      title: 'JANSEVA.AI (जनसेवा डिजिटल सहाय्यक)',
      benefit: 'केंद्र व महाराष्ट्र शासनाच्या सर्व सरकारी योजनांची मोफत व अचूक माहिती.',
      eligibility: 'भारतातील सर्व नागरिक.',
      docs: 'कागदपत्रांची गरज नाही — थेट प्रश्न विचारा किंवा माइकद्वारे बोला.',
      portal: 'aaplesarkar.mahaonline.gov.in / जवळचे जनसेवा केंद्र'
    },
    en: {
      title: 'JANSEVA.AI (Citizen Service Assistant)',
      benefit: 'Instant official information on 500+ Indian Government welfare schemes and civic services.',
      eligibility: 'All citizens of India.',
      docs: 'No documents needed — simply ask your question or speak via microphone.',
      portal: 'india.gov.in / myscheme.gov.in / Nearest CSC Jan Seva Kendra'
    }
  },
  {
    id: 'pm_kisan',
    triggers: ['pm kisan', 'kisan samman', 'kisan', 'शेतकरी', 'किसान', '6000', 'hafta', 'kist', 'installment', 'farmer'],
    hi: {
      title: 'प्रधानमंत्री किसान सम्मान निधि (PM-KISAN)',
      benefit: '₹6,000 प्रति वर्ष (₹2,000 की 3 समान किस्तों में सीधे बैंक खाते में DBT)।',
      eligibility: 'सभी भूमिधारक किसान परिवार (संस्थागत भूमिधारक व आयकरदाता पात्र नहीं हैं)।',
      docs: 'आधार कार्ड, बैंक खाता (Aadhaar Seeded), जमीन की खतौनी/जमाबंदी (Land Records), ई-केवाईसी।',
      portal: 'pmkisan.gov.in / नजदीकी CSC केंद्र'
    },
    mr: {
      title: 'पंतप्रधान किसान सन्मान निधी (PM-KISAN)',
      benefit: 'दरवर्षी ₹6,000 (₹2,000 च्या 3 हप्त्यांमध्ये थेट बँक खात्यात जमा).',
      eligibility: 'शेतजमीन असणारे सर्व शेतकरी कुटुंब (आयकर भरणारे अपात्र).',
      docs: 'आधार कार्ड, बँक पासबुक, 7/12 व 8-अ उतारा, ई-केवायसी (e-KYC).',
      portal: 'pmkisan.gov.in / आपले सरकार सेवा केंद्र'
    },
    en: {
      title: 'Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)',
      benefit: '₹6,000 per year in 3 equal installments of ₹2,000 directly via Direct Benefit Transfer (DBT).',
      eligibility: 'All landholding farmer families across India.',
      docs: 'Aadhaar Card, Land Records (Khasra/Khatauni), Aadhaar-linked Bank Account, active e-KYC.',
      portal: 'pmkisan.gov.in or nearest Common Service Centre (CSC)'
    }
  },
  {
    id: 'ladki_bahin',
    triggers: ['ladki bahin', 'ladli behna', 'लाडकी बहीण', 'लाडली बहना', '1500', 'majhi ladki', 'mahila yojana', 'ladki'],
    hi: {
      title: 'मुख्यमंत्री माझी लाडकी बहीण योजना (महाराष्ट्र)',
      benefit: 'प्रति माह ₹1,500 की आर्थिक सहायता सीधे पात्र महिलाओं के बैंक खाते में।',
      eligibility: '21 से 65 वर्ष की विवाहित, विधवा, तलाकशुदा व निराधार महिलाएं (पारिवारिक आय ₹2.5 लाख से कम)।',
      docs: 'आधार कार्ड, महाराष्ट्र निवास प्रमाण पत्र/राशन कार्ड, बैंक पासबुक (आधार लिंक), आय प्रमाण पत्र/पीला-नारंगी राशन कार्ड।',
      portal: 'ladakibahin.maharashtra.gov.in / नारी शक्ति दूत ऐप'
    },
    mr: {
      title: 'मुख्यमंत्री माझी लाडकी बहीण योजना (महाराष्ट्र शासन)',
      benefit: 'दरमहा ₹1,500 थेट लाभार्थी महिलांच्या आधार लिंक बँक खात्यात जमा.',
      eligibility: '21 ते 65 वयोगटातील विवाहित, विधवा, घटस्फोटित व निराधार महिला (कौटुंबिक उत्पन्न ₹2.5 लाखांपेक्षा कमी).',
      docs: 'आधार कार्ड, अधिवास प्रमाणपत्र (Domicile) किंवा 15 वर्षांपूर्वीचे रेशन कार्ड/मतदान कार्ड, बँक पासबुक, हमीपत्र.',
      portal: 'ladakibahin.maharashtra.gov.in / नारी शक्ती दूत ॲप'
    },
    en: {
      title: 'Mukhyamantri Majhi Ladki Bahin Yojana',
      benefit: '₹1,500 monthly direct financial assistance to eligible women.',
      eligibility: 'Women aged 21-65 residing in Maharashtra with annual family income under ₹2.5 Lakh.',
      docs: 'Aadhaar Card, Domicile/Ration Card, Bank Passbook linked to Aadhaar, Income declaration.',
      portal: 'ladakibahin.maharashtra.gov.in / Nari Shakti Doot App'
    }
  },
  {
    id: 'ayushman_bharat',
    triggers: ['ayushman', 'pmjay', 'health card', 'golden card', '5 lakh', 'इलाज', 'आयुष्मान', 'आरोग्य', 'hospital', 'dava'],
    hi: {
      title: 'आयुष्मान भारत - प्रधानमंत्री जन आरोग्य योजना (AB-PMJAY)',
      benefit: 'प्रति परिवार प्रति वर्ष ₹5,00,000 तक का मुफ़्त कैशलेस इलाज (सरकारी व सूचीबद्ध निजी अस्पतालों में)।',
      eligibility: 'SECC 2011 सूची में शामिल परिवार, राशन कार्ड धारक एवं 70 वर्ष से अधिक आयु के सभी वरिष्ठ नागरिक।',
      docs: 'आधार कार्ड, राशन कार्ड, मोबाइल नंबर।',
      portal: 'beneficiary.nha.gov.in / नजदीकी सरकारी अस्पताल या CSC'
    },
    mr: {
      title: 'आयुष्मान भारत - महात्मा जोतिराव फुले जन आरोग्य योजना',
      benefit: 'कुटुंबाला दरवर्षी ₹5,00,000 पर्यंत मोफत उपचार व शस्त्रक्रिया (नोंदणीकृत खाजगी व सरकारी रुग्णालयांमध्ये).',
      eligibility: 'पिवळे/केशरी रेशनकार्ड धारक, शेतकरी व 70 वर्षांवरील सर्व ज्येष्ठ नागरिक.',
      docs: 'आधार कार्ड, रेशन कार्ड, ओळखपत्र.',
      portal: 'beneficiary.nha.gov.in / सरकारी रुग्णालय आरोग्य मित्र कक्ष'
    },
    en: {
      title: 'Ayushman Bharat Pradhan Mantri Jan Arogya Yojana (AB-PMJAY)',
      benefit: 'Free cashless health cover up to ₹5,00,000 per family per year across empaneled hospitals.',
      eligibility: 'SECC eligible families, ration card holders, and all senior citizens aged 70+.',
      docs: 'Aadhaar Card, Ration Card, Active Mobile Number.',
      portal: 'beneficiary.nha.gov.in or nearest Empaneled Hospital / CSC'
    }
  },
  {
    id: 'pm_awas',
    triggers: ['pm awas', 'pmay', 'awas', 'makaan', 'ghar', 'घरकुल', 'आवास', 'housing', 'home'],
    hi: {
      title: 'प्रधानमंत्री आवास योजना (PMAY - ग्रामीण व शहरी)',
      benefit: 'पक्के मकान निर्माण हेतु ग्रामीण में ₹1,20,000 से ₹1,30,000 एवं शहरी में ₹2.5 लाख तक की सब्सिडी।',
      eligibility: 'बेघर परिवार या कच्चे मकान में रहने वाले परिवार जिनके पास भारत में कहीं भी पक्का मकान नहीं है।',
      docs: 'आधार कार्ड, बैंक खाता, मनरेगा जॉब कार्ड (ग्रामीण), आय प्रमाण पत्र, जमीन के दस्तावेज/पट्टा।',
      portal: 'pmayg.nic.in (ग्रामीण) / pmaymis.gov.in (शहरी) / ग्राम पंचायत'
    },
    mr: {
      title: 'प्रधानमंत्री आवास योजना / रमाई व शबरी घरकुल योजना',
      benefit: 'पक्के घर बांधकामासाठी ₹1,20,000 ते ₹2,50,000 पर्यंत थेट आर्थिक अनुदान.',
      eligibility: 'कच्च्या घरात राहणारे बेघर कुटुंब, ज्यांच्या नावावर पक्के घर नाही.',
      docs: 'आधार कार्ड, बँक पासबुक, जागेचा 7/12 किंवा नमुना 8, जॉब कार्ड, उत्पन्नाचा दाखला.',
      portal: 'pmayg.nic.in / ग्रामपंचायत कार्यालय किंवा नगरपरिषद'
    },
    en: {
      title: 'Pradhan Mantri Awas Yojana (PMAY - Housing for All)',
      benefit: 'Direct financial subsidy of ₹1.2 Lakh to ₹2.5 Lakh for building a pucca home.',
      eligibility: 'Homeless families or those living in kutcha/dilapidated houses with no pucca house across India.',
      docs: 'Aadhaar Card, Bank Details, Land documents/Registry, MGNREGA Job Card (Rural).',
      portal: 'pmayg.nic.in (Rural) / pmaymis.gov.in (Urban) or Village Panchayat'
    }
  },
  {
    id: 'ration_card',
    triggers: ['ration', 'ration card', 'rashan', 'राशन', 'रेशन', 'bpl', 'apl', 'anaj', 'chawal', 'gehun'],
    hi: {
      title: 'राष्ट्रीय खाद्य सुरक्षा योजना (NFSA राशन कार्ड सेवा)',
      benefit: 'प्रति सदस्य 5 किलो मुफ़्त अनाज (गेहूं, चावल) एवं राशन कार्ड से सरकारी पहचान।',
      eligibility: 'गरीबी रेखा से नीचे (BPL/AAY) एवं पात्र गृहस्थी (PHH) परिवार।',
      docs: 'परिवार के सभी सदस्यों के आधार कार्ड, परिवार मुखिया (महिला) की फोटो, बैंक खाता, निवास प्रमाण।',
      portal: 'nfsa.gov.in / राज्य खाद्य पोर्टल / तहसील आपूर्ति कार्यालय'
    },
    mr: {
      title: 'सार्वजनिक वितरण प्रणाली (रेशन कार्ड सेवा)',
      benefit: 'पात्र कुटुंबांना मोफत/सवलतीच्या दरात धान्य (तांदूळ, गहू) व विविध योजनांचा आधार.',
      eligibility: 'अन्नसुरक्षा योजनेतील पात्र कुटुंबे (पिवळे/केशरी रेशन कार्ड).',
      docs: 'सर्व सदस्यांचे आधार कार्ड, कुटुंबप्रमुख महिलेचे बँक पासबुक, वीज बिल, उत्पन्नाचा दाखला.',
      portal: 'rcms.mahafood.gov.in / तहसील कार्यालय किंवा आपले सरकार'
    },
    en: {
      title: 'National Food Security Act (NFSA Ration Card)',
      benefit: '5 kg free subsidized food grains per person per month and official citizen identification.',
      eligibility: 'Eligible Antyodaya (AAY) and Priority Household (PHH) families.',
      docs: 'Aadhaar of all members, Photo of female head of household, Bank passbook, Address proof.',
      portal: 'nfsa.gov.in or State Food Civil Supplies Portal'
    }
  },
  {
    id: 'pm_surya_ghar',
    triggers: ['surya ghar', 'solar', 'सौर ऊर्जा', 'सोलर', 'bijli', 'electricity bill', 'light bill', 'rooftop'],
    hi: {
      title: 'पीएम सूर्य घर मुफ्त बिजली योजना (Rooftop Solar)',
      benefit: 'हर महीने 300 यूनिट तक मुफ़्त बिजली + सोलर रूफटॉप लगाने पर ₹78,000 तक की सरकारी सब्सिडी।',
      eligibility: 'भारतीय नागरिक जिनके पास पक्की छत और वैध घरेलू बिजली कनेक्शन है।',
      docs: 'आधार कार्ड, नवीनतम बिजली बिल, छत के स्वामित्व का प्रमाण, बैंक पासबुक।',
      portal: 'pmsuryaghar.gov.in'
    },
    mr: {
      title: 'पीएम सूर्य घर मोफत वीज योजना (रूफटॉप सोलर)',
      benefit: 'दरमहा 300 युनिट मोफत वीज आणि छतावर सोलर बसवण्यासाठी ₹78,000 पर्यंत थेट सरकारी अनुदान.',
      eligibility: 'स्वतःचे घर/छत असलेले आणि घरगुती वीज मीटर असणारे नागरिक.',
      docs: 'आधार कार्ड, चालू महिन्याचे वीज बिल, घराचा पुरावा, बँक पासबुक.',
      portal: 'pmsuryaghar.gov.in'
    },
    en: {
      title: 'PM Surya Ghar Muft Bijli Yojana (Rooftop Solar)',
      benefit: 'Up to 300 units free solar electricity every month + government subsidy up to ₹78,000.',
      eligibility: 'Indian homeowners with a suitable roof and active domestic electricity connection.',
      docs: 'Aadhaar Card, Latest Electricity Bill, Roof/House ownership proof, Bank Details.',
      portal: 'pmsuryaghar.gov.in'
    }
  },
  {
    id: 'sukanya',
    triggers: ['sukanya', 'sukanya samriddhi', 'सुकन्या', 'daughter', 'beti', 'girl child', 'ladki ki padhai'],
    hi: {
      title: 'सुकन्या समृद्धि योजना (SSY)',
      benefit: '8.2% उच्चतम सुरक्षित ब्याज दर, 21 वर्ष में बड़ी परिपक्वता राशि और आयकर धारा 80C में छूट।',
      eligibility: '10 वर्ष से कम आयु की बालिकाओं (अधिकतम 2 बेटियां प्रति परिवार) के नाम पर।',
      docs: 'बालिका का जन्म प्रमाण पत्र, माता-पिता/अभिभावक का आधार कार्ड व पैन कार्ड, पता प्रमाण।',
      portal: 'नजदीकी डाकघर (Post Office) या अधिकृत बैंक शाखा'
    },
    mr: {
      title: 'सुकन्या समृद्धी योजना (मुलींच्या भवितव्यासाठी)',
      benefit: 'वार्षिक 8.2% उच्च व्याजदर, 21 वर्षांनंतर उच्च शिक्षणासाठी भरघोस रक्कम व पूर्ण करमुक्ती.',
      eligibility: '10 वर्षांखालील मुलींच्या नावे (एका कुटुंबात कमाल 2 मुलींसाठी).',
      docs: 'मुलीचा जन्म दाखला, पालकांचे आधार कार्ड व पॅन कार्ड, पत्त्याचा पुरावा.',
      portal: 'जवळचे पोस्ट ऑफिस (Post Office) किंवा राष्ट्रीयीकृत बँक'
    },
    en: {
      title: 'Sukanya Samriddhi Yojana (SSY)',
      benefit: 'High 8.2% sovereign government interest rate, guaranteed tax-free maturity amount for girl child education & marriage.',
      eligibility: 'Girl child below 10 years of age (up to 2 daughters per family).',
      docs: 'Girl child birth certificate, Parent/Guardian Aadhaar & PAN, Address proof.',
      portal: 'Nearest Post Office or any authorized Public/Private Bank'
    }
  },
  {
    id: 'pm_mudra',
    triggers: ['mudra', 'loan', 'karz', 'business loan', 'shishu', 'kishore', 'tarun', 'दुकान', 'मुद्रा लोन', 'karja'],
    hi: {
      title: 'प्रधानमंत्री मुद्रा योजना (PMMY बिज़नेस लोन)',
      benefit: 'बिना गारंटी ₹50,000 (शिशु) से ₹20,00,000 (तरुण प्लस) तक का आसान व्यापार ऋण।',
      eligibility: 'छोटे व्यापारी, दुकानदार, विनिर्माता, कारीगर व नए उद्यमी।',
      docs: 'आधार कार्ड, पैन कार्ड, व्यापार का प्रमाण/उद्यम रजिस्ट्रेशन, पिछले 6 माह का बैंक स्टेटमेंट।',
      portal: 'udyamimitra.in / नजदीकी सरकारी या ग्रामीण बैंक'
    },
    mr: {
      title: 'प्रधानमंत्री मुद्रा कर्ज योजना (PMMY)',
      benefit: 'विनातारण ₹50,000 ते ₹20 लाखांपर्यंत व्यवसाय कर्ज (शिशू, किशोर व तरुण श्रेणी).',
      eligibility: 'लघु उद्योजक, दुकानदार, सेवा पुरवठादार व नवीन व्यवसाय सुरू करू इच्छिणारे नागरिक.',
      docs: 'आधार कार्ड, पॅन कार्ड, उद्योग आधार (Udyam), बँक स्टेटमेंट, प्रकल्प अहवाल.',
      portal: 'udyamimitra.in / कोणतीही सरकारी किंवा खाजगी बँक शाखा'
    },
    en: {
      title: 'Pradhan Mantri MUDRA Yojana (PMMY)',
      benefit: 'Collateral-free business loans up to ₹20 Lakhs (Shishu: up to 50k, Kishore: up to 5L, Tarun: up to 20L).',
      eligibility: 'Non-Corporate, Non-Farm Small/Micro enterprises and new entrepreneurs.',
      docs: 'Aadhaar Card, PAN Card, Business registration (Udyam), 6-month Bank Statement.',
      portal: 'udyamimitra.in or any Nationalized Bank branch'
    }
  },
  {
    id: 'aadhaar_services',
    triggers: ['aadhaar', 'uidai', 'आधार', 'phone link', 'mobile link', 'address change', 'fingerprint', 'biometric'],
    hi: {
      title: 'आधार कार्ड ऑनलाइन सेवाएं (UIDAI)',
      benefit: 'मोबाइल नंबर लिंक, पता अपडेट, फोटो व बायोमेट्रिक सुधार तथा ई-आधार डाउनलोड।',
      eligibility: 'भारत का प्रत्येक आधार धारक नागरिक।',
      docs: 'पहचान व पते का वैध प्रमाण (वोटर आईडी, पासपोर्ट, बिजली बिल, राशन कार्ड आदि)।',
      portal: 'myaadhaar.uidai.gov.in / नजदीकी आधार सेवा केंद्र या पोस्ट ऑफिस'
    },
    mr: {
      title: 'आधार कार्ड सेवा व दुरुस्ती (UIDAI)',
      benefit: 'मोबाईल नंबर जोडणे, पत्ता बदलणे, जन्मतारीख दुरुस्ती व ई-आधार डाऊनलोड.',
      eligibility: 'भारतातील सर्व आधार कार्डधारक नागरिक.',
      docs: 'ओळखपत्र व पत्त्याचा पुरावा (रेशन कार्ड, पॅन कार्ड, मतदान ओळखपत्र इ.).',
      portal: 'myaadhaar.uidai.gov.in / जवळचे आधार सेवा केंद्र किंवा पोस्ट ऑफिस'
    },
    en: {
      title: 'Aadhaar Card Citizen Services (UIDAI)',
      benefit: 'Mobile linking, online address update, biometric update, and instant e-Aadhaar download.',
      eligibility: 'All Indian citizens with an Aadhaar number.',
      docs: 'Proof of Identity (POI) and Proof of Address (POA) documents.',
      portal: 'myaadhaar.uidai.gov.in or nearest Aadhaar Seva Kendra / Post Office'
    }
  }
];

/**
 * Format scheme data into the clean JANSEVA citizen answer format
 */
function formatSchemeAnswer(scheme, lang = 'hi') {
  const data = scheme[lang] || scheme['hi'] || scheme['en'];
  if (lang === 'mr') {
    return `📋 **योजना:** ${data.title}
🎁 **मुख्य लाभ:** ${data.benefit}
✅ **पात्रता:** ${data.eligibility}
📄 **आवश्यक कागदपत्रे:** ${data.docs}
🔗 **अर्ज कोठे करावा / पोर्टल:** ${data.portal}`;
  } else if (lang === 'en') {
    return `📋 **Scheme / Service:** ${data.title}
🎁 **Key Benefit:** ${data.benefit}
✅ **Eligibility:** ${data.eligibility}
📄 **Documents Required:** ${data.docs}
🔗 **Official Portal:** ${data.portal}`;
  } else {
    return `📋 **योजना:** ${data.title}
🎁 **मुख्य लाभ:** ${data.benefit}
✅ **पात्रता:** ${data.eligibility}
📄 **आवश्यक दस्तावेज़:** ${data.docs}
🔗 **आवेदन पोर्टल:** ${data.portal}`;
  }
}

/**
 * Detect language from text
 */
function detectLang(text, preferredLang = 'auto') {
  if (preferredLang && preferredLang !== 'auto') return preferredLang;
  const t = text.toLowerCase();
  // Marathi indicators
  if (t.includes('आहे') || t.includes('नाही') || t.includes('करावे') || t.includes('सांगा') || t.includes('नाव') || t.includes('योजनेबद्दल')) return 'mr';
  // Hindi indicators
  if (t.includes('है') || t.includes('क्या') || t.includes('चाहिए') || t.includes('बताइए') || t.includes('मिलेगा') || t.includes('योजना')) return 'hi';
  // English
  if (/^[a-zA-Z0-9\s.,?!'-]+$/.test(text)) return 'en';
  return 'hi';
}

/**
 * Core Citizen AI Engine Query Handler
 */
function queryCitizenAi(query, preferredLang = 'auto') {
  const q = (query || '').toLowerCase().trim();
  const lang = detectLang(query, preferredLang);

  // 1. Direct match in database
  for (const s of SCHEMES_DATABASE) {
    for (const trig of s.triggers) {
      if (q.includes(trig)) {
        return {
          success: true,
          reply: formatSchemeAnswer(s, lang),
          language: lang,
          source: 'citizen_ai_engine'
        };
      }
    }
  }

  // 2. Intelligent general citizen guidance
  if (lang === 'mr') {
    return {
      success: true,
      reply: `📋 **जनसेवा नागरिक सहाय्यता:**
मी **JANSEVA.AI** आहे — भारत सरकार आणि महाराष्ट्र शासनाच्या सर्व योजनांची माहिती देणारा सहाय्यक.

🎁 **कशासाठी मदत हवी आहे?**
• **शेतकरी योजना:** PM-KISAN, नमो शेतकरी, पीक विमा
• **महिला सक्षमीकरण:** माझी लाडकी बहीण, सुकन्या समृद्धी
• **आरोग्य व गृहनिर्माण:** महात्मा फुले जन आरोग्य, PM आवास (घरकुल)
• **कागदपत्रे:** रेशन कार्ड, आधार कार्ड, जातीचा व उत्पन्नाचा दाखला

🔗 **मार्गदर्शन:** जवळच्या **आपले सरकार सेवा केंद्रास (CSC)** भेट द्या किंवा वरील विषयावर विशिष्ट प्रश्न विचारा.`,
      language: 'mr',
      source: 'citizen_ai_engine'
    };
  } else if (lang === 'en') {
    return {
      success: true,
      reply: `📋 **JANSEVA Citizen Guidance:**
I am **JANSEVA.AI** — your official citizen assistant for all Indian Government welfare schemes.

🎁 **You can ask about:**
• **Agriculture:** PM-KISAN, Crop Insurance, Solar Pumps (KUSUM)
• **Women & Children:** Ladki Bahin, Sukanya Samriddhi, Free LPG (Ujjwala)
• **Healthcare & Housing:** Ayushman Bharat (PM-JAY), PM Awas Yojana
• **Documents & Loans:** Ration Card, Aadhaar Update, MUDRA Loans, E-Shram

🔗 **Assistance:** Visit your nearest **Jan Seva Kendra (CSC)** or ask specifically about any scheme above!`,
      language: 'en',
      source: 'citizen_ai_engine'
    };
  } else {
    return {
      success: true,
      reply: `📋 **जनसेवा नागरिक सहायता:**
मैं **JANSEVA.AI** हूँ — भारत सरकार और राज्य सरकारों की सभी जन कल्याणकारी योजनाओं की जानकारी देने वाला आधिकारिक सहायक।

🎁 **आप इन योजनाओं के बारे में पूछ सकते हैं:**
• **किसान कल्याण:** पीएम किसान (PM-KISAN), किसान क्रेडिट कार्ड, फसल बीमा
• **महिला कल्याण:** लाडली बहना/लाडकी बहीण, सुकन्या समृद्धि, उज्ज्वला गैस
• **स्वास्थ्य व आवास:** आयुष्मान भारत (₹5 लाख फ्री इलाज), पीएम आवास योजना
• **दस्तावेज़ व ऋण:** राशन कार्ड, आधार सुधार, ई-श्रम, मुद्रा बिज़नेस लोन

🔗 **सहायता:** अपने नजदीकी **जन सेवा केंद्र (CSC)** पर जाएं या ऊपर दी गई किसी भी योजना का नाम लिखकर पूछें!`,
      language: 'hi',
      source: 'citizen_ai_engine'
    };
  }
}

module.exports = {
  queryCitizenAi,
  SCHEMES_DATABASE,
};
