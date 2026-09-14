/**
 * Tap2Med Modular Clinical Labs Engine & Trends System
 * Standardized test database, instant patient profile persistence, live trend charting.
 * Clean, decoupled component architecture.
 */

(function () {
  "use strict";

  // Raw compact catalog: [key, name, category, unit, min, max, [aliases]]
  const RAW_CATALOG = [
    [
      "haem_cbc",
      "Complete Blood Count (CBC)",
      "Haematology",
      "Profile",
      null,
      null,
      ["cbc", "hemogram", "blood count", "complete blood picture", "cbp"],
    ],
    [
      "haem_hb",
      "Haemoglobin (Hb)",
      "Haematology",
      "g/dL",
      12.0,
      16.0,
      ["hb", "hemoglobin", "anaemia", "anemia"],
    ],
    [
      "haem_rbc",
      "Total RBC Count",
      "Haematology",
      "million/mcL",
      4.2,
      5.8,
      ["rbc", "red blood cells", "erythrocyte count"],
    ],
    [
      "haem_wbc",
      "Total Leucocyte Count (TLC / WBC)",
      "Haematology",
      "cells/mcL",
      4000.0,
      11000.0,
      ["wbc", "tlc", "white blood cells", "leucocytes"],
    ],
    [
      "haem_platelets",
      "Platelet Count",
      "Haematology",
      "lakhs/mcL",
      1.5,
      4.5,
      ["platelets", "thrombocytes", "plt", "dengue count"],
    ],
    [
      "haem_pcv",
      "Packed Cell Volume (PCV / Hematocrit)",
      "Haematology",
      "%",
      36.0,
      50.0,
      ["pcv", "hematocrit", "hct"],
    ],
    [
      "haem_mcv",
      "Mean Corpuscular Volume (MCV)",
      "Haematology",
      "fL",
      80.0,
      100.0,
      ["mcv", "rbc indices"],
    ],
    [
      "haem_mch",
      "Mean Corpuscular Hemoglobin (MCH)",
      "Haematology",
      "pg",
      27.0,
      33.0,
      ["mch"],
    ],
    ["haem_mchc", "MCHC", "Haematology", "g/dL", 32.0, 36.0, ["mchc"]],
    [
      "haem_rdw",
      "RDW (Red Cell Distribution Width)",
      "Haematology",
      "%",
      11.5,
      14.5,
      ["rdw", "anisocytosis"],
    ],
    [
      "haem_neutrophils",
      "Neutrophils (%)",
      "Haematology",
      "%",
      40.0,
      75.0,
      ["neutrophil", "polymorphs", "dlc"],
    ],
    [
      "haem_lymphocytes",
      "Lymphocytes (%)",
      "Haematology",
      "%",
      20.0,
      45.0,
      ["lymphocyte", "dlc"],
    ],
    [
      "haem_monocytes",
      "Monocytes (%)",
      "Haematology",
      "%",
      2.0,
      10.0,
      ["monocyte", "dlc"],
    ],
    [
      "haem_eosinophils",
      "Eosinophils (%)",
      "Haematology",
      "%",
      1.0,
      6.0,
      ["eosinophil", "allergy cell", "dlc"],
    ],
    [
      "haem_basophils",
      "Basophils (%)",
      "Haematology",
      "%",
      0.0,
      1.0,
      ["basophil", "dlc"],
    ],
    [
      "haem_aec",
      "Absolute Eosinophil Count (AEC)",
      "Haematology",
      "cells/mcL",
      40.0,
      450.0,
      ["aec", "absolute eosinophils", "allergy count", "asthma"],
    ],
    [
      "haem_anc",
      "Absolute Neutrophil Count (ANC)",
      "Haematology",
      "cells/mcL",
      1500.0,
      8000.0,
      ["anc", "absolute neutrophils", "neutropenia"],
    ],
    [
      "haem_alc",
      "Absolute Lymphocyte Count (ALC)",
      "Haematology",
      "cells/mcL",
      1000.0,
      4000.0,
      ["alc", "absolute lymphocytes"],
    ],
    [
      "haem_esr",
      "ESR (Erythrocyte Sedimentation Rate)",
      "Haematology",
      "mm/hr",
      0.0,
      20.0,
      ["esr", "sed rate", "westergren", "inflammation"],
    ],
    [
      "haem_retic",
      "Reticulocyte Count",
      "Haematology",
      "%",
      0.5,
      2.5,
      ["reticulocyte", "retic", "bone marrow response"],
    ],
    [
      "haem_pbs",
      "Peripheral Blood Smear (PBS)",
      "Haematology",
      "Microscopy",
      null,
      null,
      ["pbs", "blood smear", "malaria parasite smear", "morphology"],
    ],
    [
      "haem_bt_ct",
      "Bleeding Time & Clotting Time (BT/CT)",
      "Haematology",
      "Minutes",
      null,
      null,
      ["bt", "ct", "bleeding time", "clotting time"],
    ],
    [
      "haem_pt_inr",
      "Prothrombin Time & INR (PT/INR)",
      "Haematology",
      "INR",
      0.8,
      1.2,
      ["pt", "inr", "prothrombin", "warfarin monitoring", "coagulation"],
    ],
    [
      "haem_aptt",
      "Activated Partial Thromboplastin Time (APTT)",
      "Haematology",
      "Seconds",
      26.0,
      38.0,
      ["aptt", "ptt", "heparin monitoring", "clotting"],
    ],
    [
      "haem_d_dimer",
      "D-Dimer (Quantitative)",
      "Haematology",
      "ng/mL",
      0.0,
      500.0,
      ["d dimer", "ddimer", "thrombosis", "dvt", "pulmonary embolism"],
    ],
    [
      "haem_fibrinogen",
      "Serum Fibrinogen",
      "Haematology",
      "mg/dL",
      200.0,
      400.0,
      ["fibrinogen", "factor 1", "clotting factor"],
    ],
    [
      "haem_blood_group",
      "Blood Group & Rh Typing",
      "Haematology",
      "Typing",
      null,
      null,
      ["blood group", "abo", "rh factor", "rh positive", "rh negative"],
    ],
    [
      "haem_coombs_direct",
      "Direct Coombs Test (DAT)",
      "Haematology",
      "Qualitative",
      null,
      null,
      ["coombs direct", "dat", "hemolytic anemia"],
    ],
    [
      "haem_coombs_indirect",
      "Indirect Coombs Test (ICT)",
      "Haematology",
      "Qualitative",
      null,
      null,
      ["coombs indirect", "ict", "antibody screening", "antenatal"],
    ],
    [
      "haem_hb_electrophoresis",
      "Hemoglobin Electrophoresis / HPLC",
      "Haematology",
      "Analysis",
      null,
      null,
      ["hplc", "thalassemia", "sickle cell", "hb a2", "hb f"],
    ],
    [
      "haem_g6pd",
      "G6PD Quantitative Assay",
      "Haematology",
      "U/g Hb",
      4.6,
      13.5,
      ["g6pd", "favism", "hemolysis enzyme"],
    ],
    [
      "diab_fbs",
      "Fasting Blood Sugar (FBS)",
      "Diabetes & Glycemic",
      "mg/dL",
      70.0,
      99.0,
      ["fbs", "fasting glucose", "sugar fasting", "diabetes"],
    ],
    [
      "diab_ppbs",
      "Post Prandial Blood Sugar (PPBS)",
      "Diabetes & Glycemic",
      "mg/dL",
      90.0,
      140.0,
      ["ppbs", "pp blood sugar", "post meals glucose", "2hr sugar"],
    ],
    [
      "diab_rbs",
      "Random Blood Sugar (RBS)",
      "Diabetes & Glycemic",
      "mg/dL",
      70.0,
      140.0,
      ["rbs", "random sugar", "glucose random"],
    ],
    [
      "diab_hba1c",
      "Glycosylated Haemoglobin (HbA1c)",
      "Diabetes & Glycemic",
      "%",
      4.0,
      5.6,
      ["hba1c", "a1c", "glycated hemoglobin", "3 month sugar"],
    ],
    [
      "diab_eag",
      "Estimated Average Glucose (eAG)",
      "Diabetes & Glycemic",
      "mg/dL",
      70.0,
      126.0,
      ["eag", "mean blood glucose", "mbg"],
    ],
    [
      "diab_insulin_fasting",
      "Serum Insulin (Fasting)",
      "Diabetes & Glycemic",
      "mcIU/mL",
      2.6,
      24.9,
      ["insulin fasting", "fasting insulin", "hyperinsulinemia"],
    ],
    [
      "diab_insulin_pp",
      "Serum Insulin (Post Prandial)",
      "Diabetes & Glycemic",
      "mcIU/mL",
      16.0,
      166.0,
      ["insulin pp", "post prandial insulin"],
    ],
    [
      "diab_c_peptide",
      "C-Peptide (Fasting)",
      "Diabetes & Glycemic",
      "ng/mL",
      0.9,
      4.0,
      ["c peptide", "c-peptide", "beta cell reserve", "type 1 diabetes"],
    ],
    [
      "diab_homa_ir",
      "HOMA-IR (Insulin Resistance Index)",
      "Diabetes & Glycemic",
      "Score",
      0.5,
      1.9,
      ["homa ir", "insulin resistance", "metabolic syndrome"],
    ],
    [
      "diab_fructosamine",
      "Serum Fructosamine",
      "Diabetes & Glycemic",
      "umol/L",
      200.0,
      285.0,
      ["fructosamine", "glycated protein", "short term sugar"],
    ],
    [
      "diab_gtt",
      "Oral Glucose Tolerance Test (OGTT - 75g)",
      "Diabetes & Glycemic",
      "mg/dL",
      null,
      140.0,
      ["gtt", "ogtt", "glucose tolerance", "gestational diabetes"],
    ],
    [
      "diab_microalbumin_spot",
      "Urine Microalbumin (Spot)",
      "Diabetes & Glycemic",
      "mg/L",
      0.0,
      20.0,
      ["urine microalbumin", "early nephropathy", "diabetic kidney"],
    ],
    [
      "bio_sodium",
      "Serum Sodium (Na+)",
      "Bio Chemistry",
      "mEq/L",
      135.0,
      145.0,
      ["sodium", "na", "electrolytes", "hyponatremia", "hypernatremia"],
    ],
    [
      "bio_potassium",
      "Serum Potassium (K+)",
      "Bio Chemistry",
      "mEq/L",
      3.5,
      5.1,
      ["potassium", "k", "hypokalemia", "hyperkalemia"],
    ],
    [
      "bio_chloride",
      "Serum Chloride (Cl-)",
      "Bio Chemistry",
      "mEq/L",
      96.0,
      106.0,
      ["chloride", "cl", "electrolytes"],
    ],
    [
      "bio_bicarbonate",
      "Serum Bicarbonate (HCO3)",
      "Bio Chemistry",
      "mEq/L",
      22.0,
      29.0,
      ["bicarbonate", "hco3", "acid base balance", "metabolic acidosis"],
    ],
    [
      "bio_calcium",
      "Serum Calcium (Total)",
      "Bio Chemistry",
      "mg/dL",
      8.5,
      10.5,
      ["calcium", "total calcium", "hypocalcemia", "hypercalcemia"],
    ],
    [
      "bio_ionic_calcium",
      "Ionized Calcium",
      "Bio Chemistry",
      "mmol/L",
      1.15,
      1.33,
      ["ionized calcium", "free calcium"],
    ],
    [
      "bio_phosphorus",
      "Serum Phosphorus (Inorganic)",
      "Bio Chemistry",
      "mg/dL",
      2.5,
      4.5,
      ["phosphorus", "phosphate", "bone mineral"],
    ],
    [
      "bio_magnesium",
      "Serum Magnesium",
      "Bio Chemistry",
      "mg/dL",
      1.7,
      2.4,
      ["magnesium", "mg", "hypomagnesemia", "cramps"],
    ],
    [
      "bio_uric_acid",
      "Serum Uric Acid",
      "Bio Chemistry",
      "mg/dL",
      3.5,
      7.2,
      ["uric acid", "gout", "hyperuricemia", "joint pain"],
    ],
    [
      "lft_panel",
      "Liver Function Test (LFT Profile)",
      "Liver Function (LFT)",
      "Profile",
      null,
      null,
      ["lft", "liver panel", "hepatic function", "jaundice profile"],
    ],
    [
      "lft_bili_tot",
      "Serum Bilirubin (Total)",
      "Liver Function (LFT)",
      "mg/dL",
      0.2,
      1.2,
      ["total bilirubin", "bilirubin", "jaundice"],
    ],
    [
      "lft_bili_dir",
      "Serum Bilirubin (Direct / Conjugated)",
      "Liver Function (LFT)",
      "mg/dL",
      0.0,
      0.3,
      ["direct bilirubin", "conjugated bilirubin"],
    ],
    [
      "lft_bili_ind",
      "Serum Bilirubin (Indirect / Unconjugated)",
      "Liver Function (LFT)",
      "mg/dL",
      0.1,
      0.9,
      ["indirect bilirubin", "unconjugated bilirubin"],
    ],
    [
      "lft_sgpt",
      "SGPT / ALT (Alanine Aminotransferase)",
      "Liver Function (LFT)",
      "U/L",
      7.0,
      45.0,
      ["sgpt", "alt", "alanine aminotransferase", "liver enzyme"],
    ],
    [
      "lft_sgot",
      "SGOT / AST (Aspartate Aminotransferase)",
      "Liver Function (LFT)",
      "U/L",
      8.0,
      40.0,
      ["sgot", "ast", "aspartate aminotransferase"],
    ],
    [
      "lft_alp",
      "Alkaline Phosphatase (ALP)",
      "Liver Function (LFT)",
      "U/L",
      44.0,
      147.0,
      ["alp", "alkaline phosphatase", "biliary enzyme", "bone enzyme"],
    ],
    [
      "lft_ggt",
      "Gamma GT (GGT)",
      "Liver Function (LFT)",
      "U/L",
      9.0,
      48.0,
      ["ggt", "ggtp", "gamma glutamyl transferase", "alcohol liver"],
    ],
    [
      "lft_protein_tot",
      "Total Protein",
      "Liver Function (LFT)",
      "g/dL",
      6.0,
      8.3,
      ["total protein", "proteins"],
    ],
    [
      "lft_albumin",
      "Serum Albumin",
      "Liver Function (LFT)",
      "g/dL",
      3.5,
      5.0,
      ["albumin", "hypoalbuminemia", "edema"],
    ],
    [
      "lft_globulin",
      "Serum Globulin",
      "Liver Function (LFT)",
      "g/dL",
      2.0,
      3.5,
      ["globulin", "immune proteins"],
    ],
    [
      "lft_ag_ratio",
      "A/G Ratio (Albumin / Globulin)",
      "Liver Function (LFT)",
      "Ratio",
      1.1,
      2.2,
      ["a/g ratio", "ag ratio", "albumin globulin ratio"],
    ],
    [
      "lft_ldh",
      "Serum LDH (Lactate Dehydrogenase)",
      "Liver Function (LFT)",
      "U/L",
      140.0,
      280.0,
      ["ldh", "lactate dehydrogenase", "tissue necrosis marker"],
    ],
    [
      "kft_panel",
      "Kidney Function Test (KFT / RFT Profile)",
      "Kidney Function (KFT)",
      "Profile",
      null,
      null,
      ["kft", "rft", "renal panel", "kidney profile"],
    ],
    [
      "kft_creatinine",
      "Serum Creatinine",
      "Kidney Function (KFT)",
      "mg/dL",
      0.6,
      1.2,
      ["creatinine", "creat", "kidney failure", "renal function"],
    ],
    [
      "kft_urea",
      "Blood Urea",
      "Kidney Function (KFT)",
      "mg/dL",
      15.0,
      40.0,
      ["blood urea", "urea", "uremia"],
    ],
    [
      "kft_bun",
      "Blood Urea Nitrogen (BUN)",
      "Kidney Function (KFT)",
      "mg/dL",
      7.0,
      20.0,
      ["bun", "urea nitrogen"],
    ],
    [
      "kft_egfr",
      "Estimated GFR (eGFR - CKD-EPI)",
      "Kidney Function (KFT)",
      "mL/min/1.73m2",
      90.0,
      140.0,
      ["egfr", "gfr", "creatinine clearance", "ckd staging"],
    ],
    [
      "kft_uacr",
      "Urine Albumin to Creatinine Ratio (UACR)",
      "Kidney Function (KFT)",
      "mg/g",
      0.0,
      30.0,
      ["uacr", "spot uacr", "albuminuria", "microalbumin creatinine"],
    ],
    [
      "kft_24hr_protein",
      "24-Hour Urine Protein",
      "Kidney Function (KFT)",
      "mg/24hr",
      0.0,
      150.0,
      ["24hr urine protein", "proteinuria", "nephrotic"],
    ],
    [
      "kft_cystatin_c",
      "Serum Cystatin C",
      "Kidney Function (KFT)",
      "mg/L",
      0.55,
      1.05,
      ["cystatin c", "sensitive gfr"],
    ],
    [
      "lipid_panel",
      "Lipid Profile (Complete Panel)",
      "Lipid Profile",
      "Profile",
      null,
      null,
      ["lipid profile", "cholesterol panel", "lipids", "cardiac risk"],
    ],
    [
      "lipid_cholesterol_total",
      "Total Cholesterol",
      "Lipid Profile",
      "mg/dL",
      125.0,
      200.0,
      ["cholesterol", "total cholesterol", "hypercholesterolemia"],
    ],
    [
      "lipid_triglycerides",
      "Serum Triglycerides (TG)",
      "Lipid Profile",
      "mg/dL",
      50.0,
      150.0,
      ["triglycerides", "tg", "hypertriglyceridemia"],
    ],
    [
      "lipid_hdl",
      "HDL Cholesterol (Good Cholesterol)",
      "Lipid Profile",
      "mg/dL",
      40.0,
      60.0,
      ["hdl", "good cholesterol", "high density lipoprotein"],
    ],
    [
      "lipid_ldl",
      "LDL Cholesterol (Direct / Calculated)",
      "Lipid Profile",
      "mg/dL",
      0.0,
      100.0,
      ["ldl", "bad cholesterol", "low density lipoprotein"],
    ],
    [
      "lipid_vldl",
      "VLDL Cholesterol",
      "Lipid Profile",
      "mg/dL",
      5.0,
      30.0,
      ["vldl"],
    ],
    [
      "lipid_non_hdl",
      "Non-HDL Cholesterol",
      "Lipid Profile",
      "mg/dL",
      0.0,
      130.0,
      ["non hdl", "atherogenic cholesterol"],
    ],
    [
      "lipid_tc_hdl_ratio",
      "Total Cholesterol / HDL Ratio",
      "Lipid Profile",
      "Ratio",
      0.0,
      4.5,
      ["cholesterol hdl ratio", "tc/hdl"],
    ],
    [
      "card_trop_i",
      "Troponin-I (High Sensitivity - hs-cTnI)",
      "Cardiac Markers",
      "pg/mL",
      0.0,
      14.0,
      [
        "troponin",
        "troponin i",
        "hs ctnI",
        "heart attack",
        "myocardial infarction",
      ],
    ],
    [
      "card_trop_t",
      "Troponin-T (High Sensitivity - hs-cTnT)",
      "Cardiac Markers",
      "pg/mL",
      0.0,
      14.0,
      ["troponin t", "hs ctnt", "cardiac necrosis"],
    ],
    [
      "card_cpk_total",
      "CPK Total (Creatine Phosphokinase)",
      "Cardiac Markers",
      "U/L",
      30.0,
      200.0,
      ["cpk", "ck", "creatine kinase", "rhabdomyolysis", "muscle enzyme"],
    ],
    [
      "card_ck_mb",
      "CK-MB (Creatine Kinase-MB)",
      "Cardiac Markers",
      "ng/mL",
      0.0,
      5.0,
      ["ck mb", "ck-mb", "cpk mb"],
    ],
    [
      "card_nt_probnp",
      "NT-proBNP (N-Terminal pro-B-type Natriuretic Peptide)",
      "Cardiac Markers",
      "pg/mL",
      0.0,
      125.0,
      ["bnp", "nt probnp", "heart failure marker", "dyspnea"],
    ],
    [
      "card_homocysteine",
      "Serum Homocysteine",
      "Cardiac Markers",
      "umol/L",
      5.0,
      15.0,
      ["homocysteine", "vascular risk", "thrombophilia"],
    ],
    [
      "card_lp_a",
      "Lipoprotein (a) [Lp(a)]",
      "Cardiac Markers",
      "mg/dL",
      0.0,
      30.0,
      ["lp(a)", "lipoprotein a", "genetic cardiac risk"],
    ],
    [
      "card_apo_a1",
      "Apolipoprotein A1 (Apo-A1)",
      "Cardiac Markers",
      "mg/dL",
      119.0,
      240.0,
      ["apo a1", "apolipoprotein a1"],
    ],
    [
      "card_apo_b",
      "Apolipoprotein B (Apo-B)",
      "Cardiac Markers",
      "mg/dL",
      55.0,
      130.0,
      ["apo b", "apolipoprotein b"],
    ],
    [
      "thy_profile",
      "Thyroid Profile (Total T3, T4, TSH)",
      "Thyroid Profile",
      "Profile",
      null,
      null,
      ["thyroid profile", "tft", "t3 t4 tsh"],
    ],
    [
      "thy_tsh",
      "TSH (Ultrasensitive Thyroid Stimulating Hormone)",
      "Thyroid Profile",
      "uIU/mL",
      0.4,
      4.5,
      ["tsh", "thyrotropin", "hypothyroid", "hyperthyroid"],
    ],
    [
      "thy_ft3",
      "Free T3 (FT3)",
      "Thyroid Profile",
      "pg/mL",
      2.0,
      4.4,
      ["ft3", "free triiodothyronine"],
    ],
    [
      "thy_ft4",
      "Free T4 (FT4)",
      "Thyroid Profile",
      "ng/dL",
      0.8,
      1.8,
      ["ft4", "free thyroxine"],
    ],
    [
      "thy_total_t3",
      "Total Triiodothyronine (T3)",
      "Thyroid Profile",
      "ng/dL",
      80.0,
      200.0,
      ["total t3", "t3"],
    ],
    [
      "thy_total_t4",
      "Total Thyroxine (T4)",
      "Thyroid Profile",
      "ug/dL",
      5.0,
      12.0,
      ["total t4", "t4"],
    ],
    [
      "thy_anti_tpo",
      "Anti-TPO Antibodies (Thyroid Peroxidase)",
      "Thyroid Profile",
      "IU/mL",
      0.0,
      34.0,
      ["anti tpo", "hashimotos", "thyroid antibodies", "autoimmune thyroid"],
    ],
    [
      "thy_anti_tg",
      "Anti-Thyroglobulin Antibodies (Anti-Tg)",
      "Thyroid Profile",
      "IU/mL",
      0.0,
      115.0,
      ["anti tg", "thyroglobulin antibodies"],
    ],
    [
      "thy_pth",
      "Intact Parathyroid Hormone (iPTH)",
      "Thyroid Profile",
      "pg/mL",
      15.0,
      65.0,
      ["pth", "parathyroid", "hyperparathyroidism", "calcium regulation"],
    ],
    [
      "endo_cortisol_am",
      "Serum Cortisol (Morning 8 AM)",
      "Hormones & Endocrine",
      "ug/dL",
      6.2,
      19.4,
      ["cortisol", "morning cortisol", "stress hormone", "adrenal", "cushing"],
    ],
    [
      "endo_cortisol_pm",
      "Serum Cortisol (Evening 4 PM)",
      "Hormones & Endocrine",
      "ug/dL",
      2.3,
      11.9,
      ["cortisol pm", "evening cortisol"],
    ],
    [
      "endo_acth",
      "Plasma ACTH (Adrenocorticotropic Hormone)",
      "Hormones & Endocrine",
      "pg/mL",
      7.2,
      63.3,
      ["acth", "adrenocorticotropic", "pituitary hormone"],
    ],
    [
      "endo_prolactin",
      "Serum Prolactin",
      "Hormones & Endocrine",
      "ng/mL",
      3.0,
      25.0,
      ["prolactin", "hyperprolactinemia", "galactorrhea", "pituitary"],
    ],
    [
      "endo_testosterone_total",
      "Serum Testosterone (Total)",
      "Hormones & Endocrine",
      "ng/dL",
      240.0,
      850.0,
      [
        "testosterone",
        "total testosterone",
        "androgen",
        "hypogonadism",
        "male hormone",
      ],
    ],
    [
      "endo_testosterone_free",
      "Free Testosterone",
      "Hormones & Endocrine",
      "pg/mL",
      4.5,
      25.0,
      ["free testosterone", "bioavailable testosterone"],
    ],
    [
      "endo_dhea_s",
      "DHEA-S (Dehydroepiandrosterone Sulfate)",
      "Hormones & Endocrine",
      "ug/dL",
      80.0,
      420.0,
      ["dhea", "dhea-s", "pcos androgen", "adrenal androgen"],
    ],
    [
      "endo_amh",
      "Anti-Mullerian Hormone (AMH)",
      "Hormones & Endocrine",
      "ng/mL",
      1.0,
      4.0,
      ["amh", "ovarian reserve", "fertility", "pcos"],
    ],
    [
      "endo_fsh",
      "FSH (Follicle Stimulating Hormone)",
      "Hormones & Endocrine",
      "mIU/mL",
      1.5,
      12.4,
      ["fsh", "gonadotropin", "ovulation", "menopause", "fertility"],
    ],
    [
      "endo_lh",
      "LH (Luteinizing Hormone)",
      "Hormones & Endocrine",
      "mIU/mL",
      1.7,
      8.6,
      ["lh", "luteinizing hormone", "pcos ratio"],
    ],
    [
      "endo_estradiol",
      "Serum Estradiol (E2)",
      "Hormones & Endocrine",
      "pg/mL",
      20.0,
      350.0,
      ["estrogen", "estradiol", "e2", "female hormone"],
    ],
    [
      "endo_progesterone",
      "Serum Progesterone",
      "Hormones & Endocrine",
      "ng/mL",
      0.1,
      25.0,
      ["progesterone", "corpus luteum", "pregnancy hormone"],
    ],
    [
      "endo_beta_hcg",
      "Beta-hCG (Total / Quantitative)",
      "Hormones & Endocrine",
      "mIU/mL",
      0.0,
      5.0,
      ["hcg", "beta hcg", "pregnancy test quantitative", "ectopic pregnancy"],
    ],
    [
      "endo_growth_hormone",
      "Serum Growth Hormone (GH)",
      "Hormones & Endocrine",
      "ng/mL",
      0.05,
      6.0,
      ["growth hormone", "gh", "acromegaly", "short stature"],
    ],
    [
      "endo_igf_1",
      "IGF-1 (Somatomedin-C)",
      "Hormones & Endocrine",
      "ng/mL",
      115.0,
      300.0,
      ["igf 1", "somatomedin", "growth hormone axis"],
    ],
    [
      "endo_17_ohp",
      "17-Hydroxyprogesterone (17-OHP)",
      "Hormones & Endocrine",
      "ng/dL",
      20.0,
      200.0,
      ["17 ohp", "congenital adrenal hyperplasia", "cah"],
    ],
    [
      "vit_d3",
      "Vitamin D3 (25-Hydroxy Cholecalciferol)",
      "Vitamins & Minerals",
      "ng/mL",
      30.0,
      100.0,
      ["vitamin d", "vit d3", "25 oh vit d", "bone health", "deficiency"],
    ],
    [
      "vit_b12",
      "Vitamin B12 (Cyanocobalamin)",
      "Vitamins & Minerals",
      "pg/mL",
      211.0,
      911.0,
      ["vitamin b12", "vit b12", "cobalamin", "neuropathy", "megaloblastic"],
    ],
    [
      "vit_folic_acid",
      "Serum Folic Acid (Folate)",
      "Vitamins & Minerals",
      "ng/mL",
      4.0,
      20.0,
      ["folic acid", "folate", "macrocytic anemia", "pregnancy vitamin"],
    ],
    [
      "vit_iron_profile",
      "Iron Studies & TIBC Profile",
      "Vitamins & Minerals",
      "Profile",
      null,
      null,
      ["iron profile", "iron studies", "anemia workup"],
    ],
    [
      "vit_serum_iron",
      "Serum Iron",
      "Vitamins & Minerals",
      "ug/dL",
      60.0,
      170.0,
      ["iron", "serum iron", "fe"],
    ],
    [
      "vit_tibc",
      "Total Iron Binding Capacity (TIBC)",
      "Vitamins & Minerals",
      "ug/dL",
      250.0,
      425.0,
      ["tibc", "iron binding capacity"],
    ],
    [
      "vit_uibc",
      "Unsaturated Iron Binding Capacity (UIBC)",
      "Vitamins & Minerals",
      "ug/dL",
      155.0,
      355.0,
      ["uibc"],
    ],
    [
      "vit_transferrin_sat",
      "Transferrin Saturation (%)",
      "Vitamins & Minerals",
      "%",
      20.0,
      50.0,
      ["transferrin saturation", "iron saturation", "tsat"],
    ],
    [
      "vit_ferritin",
      "Serum Ferritin",
      "Vitamins & Minerals",
      "ng/mL",
      30.0,
      300.0,
      ["ferritin", "iron stores", "hemochromatosis", "acute phase reactant"],
    ],
    [
      "vit_zinc",
      "Serum Zinc",
      "Vitamins & Minerals",
      "ug/dL",
      70.0,
      120.0,
      ["zinc", "trace element", "immunity mineral", "hair loss"],
    ],
    [
      "vit_copper",
      "Serum Copper",
      "Vitamins & Minerals",
      "ug/dL",
      70.0,
      140.0,
      ["copper", "wilsons disease", "ceruloplasmin"],
    ],
    [
      "vit_ceruloplasmin",
      "Serum Ceruloplasmin",
      "Vitamins & Minerals",
      "mg/dL",
      20.0,
      60.0,
      ["ceruloplasmin", "copper protein"],
    ],
    [
      "inf_crp",
      "C-Reactive Protein (CRP - Quantitative)",
      "Infectious & Serology",
      "mg/L",
      0.0,
      5.0,
      ["crp", "c reactive protein", "inflammation marker", "infection"],
    ],
    [
      "inf_hscrp",
      "High Sensitivity CRP (hs-CRP)",
      "Infectious & Serology",
      "mg/L",
      0.0,
      1.0,
      ["hs crp", "hscrp", "cardiac inflammation"],
    ],
    [
      "inf_procalcitonin",
      "Procalcitonin (PCT)",
      "Infectious & Serology",
      "ng/mL",
      0.0,
      0.5,
      ["pct", "procalcitonin", "bacterial sepsis", "icu infection"],
    ],
    [
      "inf_widal",
      "Widal Slide / Tube Agglutination (Typhoid)",
      "Infectious & Serology",
      "Titre",
      null,
      null,
      ["widal", "typhoid", "enteric fever", "salmonella"],
    ],
    [
      "inf_typhidot",
      "Typhidot (IgM & IgG Antibodies)",
      "Infectious & Serology",
      "Qualitative",
      null,
      null,
      ["typhidot", "typhoid antibody", "salmonella typhi"],
    ],
    [
      "inf_dengue_ns1",
      "Dengue NS1 Antigen (Rapid / ELISA)",
      "Infectious & Serology",
      "Qualitative",
      null,
      null,
      ["dengue ns1", "ns1", "early dengue", "mosquito fever"],
    ],
    [
      "inf_dengue_serology",
      "Dengue Serology (IgM & IgG Antibodies)",
      "Infectious & Serology",
      "Qualitative",
      null,
      null,
      ["dengue igm", "dengue igg", "dengue antibody"],
    ],
    [
      "inf_malaria_antigen",
      "Malaria Antigen Rapid Card (Pv / Pf)",
      "Infectious & Serology",
      "Qualitative",
      null,
      null,
      ["malaria", "mp antigen", "plasmodium vivax", "plasmodium falciparum"],
    ],
    [
      "inf_chikungunya_igm",
      "Chikungunya IgM Antibody",
      "Infectious & Serology",
      "Qualitative",
      null,
      null,
      ["chikungunya", "chikingunya", "joint fever"],
    ],
    [
      "inf_leptospira_igm",
      "Leptospira IgM Antibodies",
      "Infectious & Serology",
      "Qualitative",
      null,
      null,
      ["leptospira", "weils disease", "monsoon fever"],
    ],
    [
      "inf_scrub_typhus",
      "Scrub Typhus IgM Antibodies",
      "Infectious & Serology",
      "Qualitative",
      null,
      null,
      ["scrub typhus", "orientia", "mite borne typhus", "eschar fever"],
    ],
    [
      "inf_blood_cs",
      "Blood Culture & Sensitivity (Aerobic/Anaerobic)",
      "Infectious & Serology",
      "Culture",
      null,
      null,
      ["blood culture", "blood c/s", "sepsis culture", "bacteremia"],
    ],
    [
      "inf_urine_cs",
      "Urine Culture & Sensitivity (Urine C/S)",
      "Infectious & Serology",
      "Culture",
      null,
      null,
      ["urine culture", "urine c/s", "uti culture", "antibiotic sensitivity"],
    ],
    [
      "inf_mantoux",
      "Mantoux Test (Tuberculin Skin Test - PPD)",
      "Infectious & Serology",
      "mm induration",
      0.0,
      10.0,
      ["mantoux", "ppd", "tuberculin", "tb skin test"],
    ],
    [
      "inf_tb_gold",
      "TB Gold / QuantiFERON (IGRA - Interferon Gamma)",
      "Infectious & Serology",
      "IU/mL",
      0.0,
      0.35,
      ["tb gold", "quantiferon", "igra", "latent tb"],
    ],
    [
      "inf_sputum_afb",
      "Sputum for Acid Fast Bacilli (AFB Smear)",
      "Infectious & Serology",
      "Microscopy",
      null,
      null,
      ["sputum afb", "afb smear", "tuberculosis smear", "zn stain"],
    ],
    [
      "inf_gene_xpert",
      "GeneXpert MTB/RIF (CBNAAT)",
      "Infectious & Serology",
      "PCR Assay",
      null,
      null,
      ["cbnaat", "genexpert", "mtb pcr", "rifampicin resistance"],
    ],
    [
      "viral_hiv",
      "HIV I & II (Antibody & p24 Antigen 4th Gen)",
      "Viral & STD Markers",
      "Qualitative",
      null,
      null,
      ["hiv", "aids screening", "elisa hiv", "retro"],
    ],
    [
      "viral_hbsag",
      "HBsAg (Hepatitis B Surface Antigen)",
      "Viral & STD Markers",
      "Qualitative",
      null,
      null,
      ["hbsag", "hepatitis b", "australia antigen", "hbv"],
    ],
    [
      "viral_anti_hbs",
      "Anti-HBs Antibody Titre (Hep B Immunity)",
      "Viral & STD Markers",
      "mIU/mL",
      10.0,
      1000.0,
      ["anti hbs", "hepatitis b vaccine titre", "hbv immunity"],
    ],
    [
      "viral_hcv",
      "HCV (Hepatitis C Total Antibodies)",
      "Viral & STD Markers",
      "Qualitative",
      null,
      null,
      ["hcv", "anti hcv", "hepatitis c"],
    ],
    [
      "viral_vdrl",
      "VDRL / RPR (Syphilis Screening)",
      "Viral & STD Markers",
      "Qualitative",
      null,
      null,
      ["vdrl", "rpr", "syphilis", "treponema"],
    ],
    [
      "viral_tpha",
      "TPHA (Treponema Pallidum Hemagglutination)",
      "Viral & STD Markers",
      "Titre",
      null,
      null,
      ["tpha", "syphilis confirmatory"],
    ],
    [
      "viral_hav_igm",
      "Hepatitis A Virus (HAV IgM)",
      "Viral & STD Markers",
      "Qualitative",
      null,
      null,
      ["hav igm", "acute hepatitis a", "viral jaundice"],
    ],
    [
      "viral_hev_igm",
      "Hepatitis E Virus (HEV IgM)",
      "Viral & STD Markers",
      "Qualitative",
      null,
      null,
      ["hev igm", "acute hepatitis e", "waterborne hepatitis"],
    ],
    [
      "viral_hsv_1_2",
      "Herpes Simplex Virus (HSV 1 & 2 IgG/IgM)",
      "Viral & STD Markers",
      "Index",
      0.0,
      0.9,
      ["hsv", "herpes", "cold sores", "genital herpes"],
    ],
    [
      "imm_ra_factor",
      "Rheumatoid Factor (RA / RF - Quantitative)",
      "Immunology & Autoimmune",
      "IU/mL",
      0.0,
      14.0,
      ["ra factor", "rf", "rheumatoid arthritis", "joint swelling"],
    ],
    [
      "imm_anti_ccp",
      "Anti-CCP Antibodies (Cyclic Citrullinated Peptide)",
      "Immunology & Autoimmune",
      "U/mL",
      0.0,
      20.0,
      ["anti ccp", "citrullinated peptide", "ra confirmatory"],
    ],
    [
      "imm_ana_ifa",
      "ANA by IFA (Antinuclear Antibodies)",
      "Immunology & Autoimmune",
      "Titre/Pattern",
      null,
      null,
      ["ana", "antinuclear", "lupus", "sle", "ifa pattern"],
    ],
    [
      "imm_ana_profile",
      "ANA Profile / Blot (16-Parameter Immunoblot)",
      "Immunology & Autoimmune",
      "Immunoblot",
      null,
      null,
      ["ana profile", "dsdna", "smith antibody", "ro", "la", "scl 70", "jo 1"],
    ],
    [
      "imm_dsdna",
      "Anti-dsDNA Antibodies",
      "Immunology & Autoimmune",
      "IU/mL",
      0.0,
      25.0,
      ["dsdna", "double stranded dna", "lupus flare"],
    ],
    [
      "imm_hla_b27",
      "HLA-B27 by Flow Cytometry / PCR",
      "Immunology & Autoimmune",
      "Qualitative",
      null,
      null,
      [
        "hla b27",
        "ankylosing spondylitis",
        "back pain genetic",
        "sacroiliitis",
      ],
    ],
    [
      "imm_aso_titre",
      "ASO Titre (Anti-Streptolysin O)",
      "Immunology & Autoimmune",
      "IU/mL",
      0.0,
      200.0,
      ["aso", "aso titre", "strep infection", "rheumatic fever"],
    ],
    [
      "imm_ige_total",
      "Total Serum IgE (Immunoglobulin E)",
      "Immunology & Autoimmune",
      "IU/mL",
      0.0,
      100.0,
      ["ige", "total ige", "allergy marker", "atopy", "allergic rhinitis"],
    ],
    [
      "imm_anti_ttg_iga",
      "Anti-Tissue Transglutaminase IgA (Anti-tTG)",
      "Immunology & Autoimmune",
      "U/mL",
      0.0,
      10.0,
      ["ttg", "anti ttg", "celiac disease", "gluten allergy"],
    ],
    [
      "imm_anca",
      "ANCA (p-ANCA & c-ANCA)",
      "Immunology & Autoimmune",
      "Titre",
      null,
      null,
      ["anca", "p-anca", "c-anca", "vasculitis", "wegeners"],
    ],
    [
      "tumor_psa_total",
      "PSA Total (Prostate Specific Antigen)",
      "Tumor Markers",
      "ng/mL",
      0.0,
      4.0,
      ["psa", "total psa", "prostate cancer", "bph", "prostatitis"],
    ],
    [
      "tumor_psa_free",
      "Free PSA & Free/Total PSA Ratio",
      "Tumor Markers",
      "%",
      25.0,
      100.0,
      ["free psa", "psa ratio"],
    ],
    [
      "tumor_cea",
      "Carcinoembryonic Antigen (CEA)",
      "Tumor Markers",
      "ng/mL",
      0.0,
      5.0,
      ["cea", "colon cancer", "rectal cancer", "gi malignancy"],
    ],
    [
      "tumor_ca125",
      "CA 125 (Ovarian Cancer Marker)",
      "Tumor Markers",
      "U/mL",
      0.0,
      35.0,
      ["ca 125", "ca125", "ovarian cancer", "endometriosis", "pelvic mass"],
    ],
    [
      "tumor_ca19_9",
      "CA 19-9 (Pancreatic & Biliary Marker)",
      "Tumor Markers",
      "U/mL",
      0.0,
      37.0,
      [
        "ca 19-9",
        "ca199",
        "pancreatic cancer",
        "cholangiocarcinoma",
        "gallbladder",
      ],
    ],
    [
      "tumor_ca15_3",
      "CA 15-3 (Breast Cancer Marker)",
      "Tumor Markers",
      "U/mL",
      0.0,
      30.0,
      ["ca 15-3", "ca153", "breast cancer recurrence"],
    ],
    [
      "tumor_afp",
      "Alpha-Fetoprotein (AFP)",
      "Tumor Markers",
      "ng/mL",
      0.0,
      8.5,
      ["afp", "alpha fetoprotein", "liver cancer", "hcc", "teratoma"],
    ],
    [
      "tumor_spep",
      "Serum Protein Electrophoresis (SPEP / M-Spike)",
      "Tumor Markers",
      "Analysis",
      null,
      null,
      ["spep", "m band", "multiple myeloma", "paraprotein"],
    ],
    [
      "tumor_free_light_chains",
      "Serum Free Light Chains (Kappa / Lambda)",
      "Tumor Markers",
      "mg/L",
      null,
      null,
      ["sflc", "kappa lambda ratio", "myeloma light chains"],
    ],
    [
      "urine_rm",
      "Urine Routine & Microscopy (Urine R/M)",
      "Urine & Stool",
      "Complete",
      null,
      null,
      ["urine routine", "urinalysis", "urine microscopy", "urine r/m"],
    ],
    [
      "urine_ph",
      "Urine pH",
      "Urine & Stool",
      "pH",
      5.0,
      8.0,
      ["urine ph", "acidic urine"],
    ],
    [
      "urine_specific_gravity",
      "Urine Specific Gravity",
      "Urine & Stool",
      "Gravity",
      1.005,
      1.03,
      ["specific gravity", "sp gravity"],
    ],
    [
      "urine_pus_cells",
      "Urine Pus Cells (Leucocytes)",
      "Urine & Stool",
      "/hpf",
      0.0,
      5.0,
      ["pus cells", "urine wbc", "pyuria", "uti pus"],
    ],
    [
      "urine_rbc",
      "Urine RBCs (Red Blood Cells)",
      "Urine & Stool",
      "/hpf",
      0.0,
      2.0,
      ["urine rbc", "hematuria", "blood in urine"],
    ],
    [
      "urine_protein",
      "Urine Protein / Albumin",
      "Urine & Stool",
      "Dipstick",
      null,
      null,
      ["urine protein", "urine albumin", "albuminuria"],
    ],
    [
      "urine_sugar",
      "Urine Sugar / Glucose",
      "Urine & Stool",
      "Dipstick",
      null,
      null,
      ["urine sugar", "glycosuria"],
    ],
    [
      "urine_ketones",
      "Urine Ketones (Acetoacetate)",
      "Urine & Stool",
      "Dipstick",
      null,
      null,
      ["urine ketones", "ketonuria", "dka", "diabetic ketoacidosis"],
    ],
    [
      "urine_bile_salts",
      "Urine Bile Salts & Pigments",
      "Urine & Stool",
      "Qualitative",
      null,
      null,
      ["bile salts", "bile pigments", "obstructive jaundice"],
    ],
    [
      "urine_upt",
      "Urine Pregnancy Test (UPT)",
      "Urine & Stool",
      "Qualitative",
      null,
      null,
      ["upt", "pregnancy test card", "urine hcg"],
    ],
    [
      "stool_rm",
      "Stool Routine & Microscopy",
      "Urine & Stool",
      "Microscopy",
      null,
      null,
      ["stool routine", "stool r/m", "ova cyst", "ameba", "giardia"],
    ],
    [
      "stool_occult_blood",
      "Stool Occult Blood (FOBT)",
      "Urine & Stool",
      "Qualitative",
      null,
      null,
      ["fobt", "stool occult blood", "gi bleeding", "colon cancer screening"],
    ],
    [
      "stool_calprotectin",
      "Fecal Calprotectin",
      "Urine & Stool",
      "ug/g",
      0.0,
      50.0,
      ["calprotectin", "ibd", "crohns", "ulcerative colitis"],
    ],
    [
      "gi_amylase",
      "Serum Amylase",
      "Bio Chemistry",
      "U/L",
      28.0,
      100.0,
      ["amylase", "acute pancreatitis", "abdominal pain enzyme"],
    ],
    [
      "gi_lipase",
      "Serum Lipase",
      "Bio Chemistry",
      "U/L",
      13.0,
      60.0,
      ["lipase", "pancreatitis specific enzyme"],
    ],
    [
      "gi_h_pylori_antigen",
      "H. Pylori Stool Antigen / Serology",
      "Infectious & Serology",
      "Qualitative",
      null,
      null,
      ["h pylori", "helicobacter", "peptic ulcer", "gastritis"],
    ],
    [
      "diag_ecg",
      "12-Lead Electrocardiogram (ECG)",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      ["ecg", "ekg", "electrocardiogram", "heart rhythm", "ischemia"],
    ],
    [
      "diag_echo",
      "2D Echocardiography & Color Doppler",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      ["echo", "2d echo", "echocardiogram", "ejection fraction", "valves"],
    ],
    [
      "diag_tmt",
      "Treadmill Exercise Stress Test (TMT)",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      ["tmt", "stress test", "treadmill test", "cardiac stress"],
    ],
    [
      "diag_cxr",
      "Chest X-Ray (PA View)",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      ["cxr", "chest x ray", "chest radiograph", "lungs", "cardiomegaly"],
    ],
    [
      "diag_usg_abdomen",
      "USG Whole Abdomen & Pelvis",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      [
        "usg abdomen",
        "ultrasound abdomen",
        "sonography abdomen",
        "fatty liver usg",
      ],
    ],
    [
      "diag_usg_kub",
      "USG KUB (Kidney, Ureter, Bladder)",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      ["usg kub", "kidney ultrasound", "renal calculi", "stone"],
    ],
    [
      "diag_usg_neck",
      "USG Neck & Thyroid",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      ["usg thyroid", "neck ultrasound", "thyroid nodule"],
    ],
    [
      "diag_ct_brain",
      "CT Brain (Plain / Contrast)",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      ["ct brain", "ct head", "stroke ct", "head injury"],
    ],
    [
      "diag_hrct_chest",
      "HRCT Chest (High-Resolution CT)",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      [
        "hrct",
        "hrct chest",
        "interstitial lung disease",
        "corads",
        "covid lung",
      ],
    ],
    [
      "diag_mri_brain",
      "MRI Brain with Diffusion (DWI)",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      ["mri brain", "brain mri", "infarct mri", "seizure mri"],
    ],
    [
      "diag_mri_spine",
      "MRI Spine (Lumbar / Cervical)",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      ["mri spine", "lumbar spine mri", "disc prolapse", "sciatica"],
    ],
    [
      "diag_fibroscan",
      "FibroScan (Liver Transient Elastography)",
      "Radiology & Imaging",
      "kPa / dB/m",
      null,
      7.0,
      ["fibroscan", "liver stiffness", "steatosis", "cap score", "cirrhosis"],
    ],
    [
      "diag_pft",
      "Pulmonary Function Test (PFT / Spirometry)",
      "Radiology & Imaging",
      "Report",
      null,
      null,
      ["pft", "spirometry", "fev1", "asthma test", "copd test"],
    ],
    [
      "diag_dexa",
      "DEXA Bone Mineral Density (BMD)",
      "Radiology & Imaging",
      "T-Score",
      -1.0,
      null,
      ["dexa", "bmd", "bone density", "osteopenia", "osteoporosis"],
    ],
  ];

  // Convert to indexed objects and maps
  const ALL_TESTS = RAW_CATALOG.map((item) => ({
    key: item[0],
    name: item[1],
    category: item[2],
    unit: item[3] || "",
    min: item[4],
    max: item[5],
    aliases: item[6] || [],
  }));

  const TEST_MAP = new Map();
  ALL_TESTS.forEach((t) => TEST_MAP.set(t.key, t));

  const CATEGORY_ORDER = [
    "Haematology",
    "Diabetes & Glycemic",
    "Bio Chemistry",
    "Liver Function (LFT)",
    "Kidney Function (KFT)",
    "Lipid Profile",
    "Thyroid Profile",
    "Cardiac Markers",
    "Hormones & Endocrine",
    "Vitamins & Minerals",
    "Infectious & Serology",
    "Viral & STD Markers",
    "Immunology & Autoimmune",
    "Tumor Markers",
    "Urine & Stool",
    "Radiology & Imaging",
    "Other Investigations",
  ];

  // Standard hardcoded lab keys in base flowsheet
  const STANDARD_FLOWSHEET_KEYS = [
    "diab_fbs",
    "diab_ppbs",
    "diab_rbs",
    "diab_hba1c",
    "diab_fast_ins",
    "diab_pp_ins",
    "diab_c_pep",
    "diab_creat",
    "diab_urea",
    "diab_bun",
    "diab_egfr",
    "diab_chol",
    "diab_tg",
    "diab_hdl",
    "diab_ldl",
    "diab_vldl",
    "diab_non_hdl",
    "diab_chol_hdl",
    "diab_ldl_hdl",
    "haem_hb",
    "haem_wbc",
    "haem_rbc",
    "haem_platelets",
    "haem_pcv",
    "haem_mcv",
    "haem_mch",
    "haem_mchc",
    "haem_rdw",
    "haem_neutrophils",
    "haem_lymphocytes",
    "haem_monocytes",
    "haem_eosinophils",
    "haem_basophils",
    "haem_esr",
    "haem_aec",
    "haem_peripheral_smear",
    "bio_bilirubin_tot",
    "bio_bilirubin_dir",
    "bio_bilirubin_ind",
    "bio_sgot",
    "bio_sgpt",
    "bio_alp",
    "bio_ggt",
    "bio_protein_tot",
    "bio_albumin",
    "bio_globulin",
    "bio_ag_ratio",
    "bio_sodium",
    "bio_potassium",
    "bio_chloride",
    "bio_calcium",
    "bio_phosphorus",
    "bio_uric",
    "lft_bili_tot",
    "lft_bili_dir",
    "lft_bili_indir",
    "lft_sgot",
    "lft_sgpt",
    "lft_alk_phos",
    "lft_ggt",
    "lft_protein_tot",
    "lft_albumin",
    "lft_globulin",
    "lft_ag_ratio",
    "uacr_urine_alb",
    "uacr_urine_creat",
    "uacr_ratio",
    "uri_color",
    "uri_appearance",
    "uri_sp_gravity",
    "uri_ph",
    "uri_protein",
    "uri_glucose",
    "uri_ketones",
    "uri_blood",
    "uri_bilirubin",
    "uri_urobilinogen",
    "uri_nitrite",
    "uri_leukocytes",
    "uri_pus_cells",
    "uri_rbc",
    "uri_epithelial",
    "uri_casts",
    "uri_crystals",
    "uri_bacteria",
    "thy_t3",
    "thy_t4",
    "thy_tsh",
    "thy_ft3",
    "thy_ft4",
    "thy_anti_tpo",
    "thy_anti_tg",
    "pcos_lh",
    "pcos_fsh",
    "pcos_lh_fsh_ratio",
    "pcos_prolactin",
    "pcos_testo_tot",
    "pcos_testo_free",
    "pcos_dheas",
    "pcos_amh",
    "pcos_17ohp",
    "oth_ecg",
    "oth_usg",
    "oth_fnac",
    "oth_trop",
    "oth_pft",
    "oth_vpt",
    "oth_vitb12",
    "oth_echo",
    "oth_iron_prof",
    "oth_serum_iron",
    "oth_tibc",
    "oth_vitd3",
    "oth_crp",
    "oth_hscrp",
    "oth_ferritin",
    "oth_mri",
    "oth_ct",
    "oth_fibro",
    "oth_ttg",
    "oth_cect",
    "oth_mri_brain",
    "oth_ige",
    "oth_ptinr",
    "oth_pth",
    "oth_anti_tpo",
  ];

  // Component State
  let activeClinicId = null;
  let activeLocalToken = null;
  let activePatientName = "Patient";
  let activeLabRecords = [];
  let currentPatientCustomDefs = {};
  let chartInstance = null;
  let searchDropdownOpen = false;

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function slugify(name) {
    return (
      "cust_" +
      name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
    );
  }

  function showToast(msg, isError = false) {
    let toast = document.getElementById("lab-toast-notice");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "lab-toast-notice";
      toast.style.cssText =
        "position: fixed; bottom: 24px; right: 24px; z-index: 10099; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 700; color: white; display: flex; align-items: center; gap: 8px; box-shadow: 0 8px 20px rgba(0,0,0,0.18); transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); opacity: 0; transform: translateY(12px); pointer-events: none;";
      document.body.appendChild(toast);
    }
    toast.style.background = isError ? "#ef4444" : "#0284c7";
    toast.innerHTML = msg;
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(12px)";
    }, 3000);
  }

  function getActiveClinicId() {
    return (
      activeClinicId ||
      window.clinicId ||
      localStorage.getItem("tap2med_clinic_id") ||
      null
    );
  }

  // Open Lab Flowsheet Modal
  async function open(localToken, patientName, clinicId) {
    if (!localToken) {
      alert("Please select a patient first.");
      return;
    }
    activeLocalToken = localToken;
    activePatientName = patientName || "Patient";
    activeClinicId =
      clinicId ||
      window.clinicId ||
      localStorage.getItem("tap2med_clinic_id") ||
      null;

    let modal = document.getElementById("labs-modal");
    if (!modal) {
      try {
        const resp = await fetch("/assets/layouts/labs.html");
        if (resp.ok) {
          const html = await resp.text();
          const container = document.createElement("div");
          container.innerHTML = html.trim();
          while (container.firstChild) {
            document.body.appendChild(container.firstChild);
          }
          modal = document.getElementById("labs-modal");
        }
      } catch (e) {
        console.warn("Failed to inject labs layout", e);
      }
    }
    if (!modal) {
      console.warn("labs-modal could not be found or loaded");
      return;
    }

    const nameEl = document.getElementById("lab-modal-patient-name");
    if (nameEl) nameEl.textContent = activePatientName;

    const tokenEl = document.getElementById("lab-local-token");
    if (tokenEl) tokenEl.value = activeLocalToken;

    modal.style.display = "flex";

    const dateInput = document.getElementById("lab-date");
    if (dateInput) {
      const today = new Date().toLocaleDateString("en-CA");
      dateInput.value = today;
    }

    // Reset search
    const searchInput = document.getElementById("lab-search-input");
    if (searchInput) searchInput.value = "";
    closeSearchDropdown();

    attachLiveInputListeners();
    await fetchLabData(activeLocalToken);
  }

  function close() {
    const modal = document.getElementById("labs-modal");
    if (modal) modal.style.display = "none";
    closeSearchDropdown();
  }

  // Fetch labs from backend
  async function fetchLabData(token) {
    const clinic = getActiveClinicId() || "";
    try {
      const url = clinic
        ? `/api/events/labs/${token}?clinic_id=${encodeURIComponent(clinic)}`
        : `/api/events/labs/${token}`;
      const res = await fetch(url);
      const data = await res.json();
      activeLabRecords = data.labs || [];
      window.patientLabData = activeLabRecords;

      // Reconstruct patient's custom & added definitions from historical records
      currentPatientCustomDefs = {};
      activeLabRecords.forEach((rec) => {
        if (rec.results && rec.results._custom_defs) {
          Object.assign(currentPatientCustomDefs, rec.results._custom_defs);
        }
        if (rec.results) {
          Object.keys(rec.results).forEach((k) => {
            if (k === "_custom_defs" || STANDARD_FLOWSHEET_KEYS.includes(k))
              return;
            if (!currentPatientCustomDefs[k]) {
              const catTest = TEST_MAP.get(k);
              if (catTest) {
                currentPatientCustomDefs[k] = {
                  key: catTest.key,
                  name: catTest.name,
                  category: catTest.category,
                  unit: catTest.unit,
                  min: catTest.min,
                  max: catTest.max,
                  isCustom: false,
                };
              } else {
                currentPatientCustomDefs[k] = {
                  key: k,
                  name: k.replace(/^(cust_|cat_)/, "").replace(/_/g, " "),
                  category: "Other Investigations",
                  unit: "",
                  min: null,
                  max: null,
                  isCustom: true,
                };
              }
            }
          });
        }
      });

      window.currentPatientCustomDefs = currentPatientCustomDefs;

      renderDynamicPatientTests();
      updateChartParameterOptions();

      const dateVal = document.getElementById("lab-date")?.value;
      populateLabInputsForDate(dateVal);
      updateChart();
    } catch (e) {
      console.error("Failed to fetch lab data", e);
    }
  }

  // Populate input fields for the selected date
  function populateLabInputsForDate(dateStr) {
    // Clear all flowsheet inputs
    document.querySelectorAll('[id^="lab-"]').forEach((el) => {
      if (["lab-date", "lab-local-token", "lab-search-input"].includes(el.id))
        return;
      el.value = "";
      checkRange(el);
    });

    const record = activeLabRecords.find((l) => l.test_date === dateStr);
    if (record && record.results) {
      Object.keys(record.results).forEach((key) => {
        if (key === "_custom_defs") return;
        const el = document.getElementById(`lab-${key}`);
        if (el) {
          el.value = record.results[key];
          checkRange(el);
        }
      });
    }

    // When inputs populate, update chart if current parameter matches
    updateChart();
  }

  // Save all entered lab values
  async function saveLabs() {
    const localToken =
      document.getElementById("lab-local-token")?.value || activeLocalToken;
    const dateStr = document.getElementById("lab-date")?.value;
    if (!dateStr) return alert("Please select a date.");

    const results = gatherCurrentScreenResults();

    if (
      currentPatientCustomDefs &&
      Object.keys(currentPatientCustomDefs).length > 0
    ) {
      results._custom_defs = currentPatientCustomDefs;
    }

    const payload = {
      clinic_id: getActiveClinicId(),
      local_token: localToken,
      lab_record: { test_date: dateStr, results: results },
    };

    try {
      const btn =
        document.getElementById("btn-save-labs") ||
        document.querySelector("#labs-modal .btn-primary");
      const originalText = btn ? btn.textContent : "Save Values";
      if (btn) btn.textContent = "Saving...";

      const res = await fetch("/api/events/labs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Save failed");

      await fetchLabData(localToken);
      if (btn) {
        btn.textContent = "Saved ✓";
        setTimeout(() => (btn.textContent = originalText), 2000);
      }
      showToast("Lab values saved successfully ✓");
    } catch (e) {
      alert("Failed to save labs.");
    }
  }

  // Gather all non-empty lab inputs on screen
  function gatherCurrentScreenResults() {
    const results = {};
    document.querySelectorAll('[id^="lab-"]').forEach((el) => {
      if (["lab-date", "lab-local-token", "lab-search-input"].includes(el.id))
        return;
      const key = el.id.replace(/^lab-/, "");
      if (el.value && el.value.trim() !== "") {
        results[key] = el.value.trim();
      }
    });
    return results;
  }

  // INSTANT PERSISTENCE: Adds a test to the patient's record on the backend immediately
  async function persistPatientTest(testDef, initialValue = "") {
    if (!testDef || !testDef.key) return;

    if (!currentPatientCustomDefs) currentPatientCustomDefs = {};
    currentPatientCustomDefs[testDef.key] = testDef;
    window.currentPatientCustomDefs = currentPatientCustomDefs;

    // Immediately render in flowsheet UI
    renderDynamicPatientTests();
    updateChartParameterOptions();

    // Fill initial value if provided
    if (initialValue !== "" && initialValue !== undefined) {
      const inputEl = document.getElementById(`lab-${testDef.key}`);
      if (inputEl) {
        inputEl.value = initialValue;
        checkRange(inputEl);
      }
    }

    // Auto-select in Trend Analysis Chart immediately
    const chartParamSelect = document.getElementById("chart-parameter");
    if (chartParamSelect) {
      chartParamSelect.value = testDef.key;
    }
    updateChart();

    // Smoothly focus and highlight the new test input
    setTimeout(() => {
      const targetInput = document.getElementById(`lab-${testDef.key}`);
      if (targetInput) {
        targetInput.focus();
        targetInput.scrollIntoView({ behavior: "smooth", block: "center" });
        targetInput.style.transition = "all 0.3s ease";
        targetInput.style.boxShadow = "0 0 0 3px rgba(2, 132, 199, 0.45)";
        setTimeout(() => {
          targetInput.style.boxShadow = "";
        }, 1800);
      }
    }, 100);

    // Call backend API PUT /api/events/labs in background to permanently persist to patient profile
    const localToken =
      document.getElementById("lab-local-token")?.value || activeLocalToken;
    const dateStr =
      document.getElementById("lab-date")?.value ||
      new Date().toISOString().slice(0, 10);
    const results = gatherCurrentScreenResults();
    results._custom_defs = currentPatientCustomDefs;
    if (initialValue !== "" && initialValue !== undefined) {
      results[testDef.key] = String(initialValue);
    }

    const payload = {
      clinic_id: getActiveClinicId(),
      local_token: localToken,
      lab_record: { test_date: dateStr, results: results },
    };

    try {
      const res = await fetch("/api/events/labs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        // Update local memory cache so it persists without losing current unsaved typing
        let existingRec = activeLabRecords.find((l) => l.test_date === dateStr);
        if (existingRec) {
          existingRec.results = Object.assign(
            existingRec.results || {},
            results,
          );
        } else {
          activeLabRecords.push({ test_date: dateStr, results: results });
        }
        showToast(
          `✓ Added <strong>${escapeHtml(testDef.name)}</strong> to patient profile`,
        );
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.warn("Background persistence returned error", errJson);
      }
    } catch (e) {
      console.warn("Background persistence network error", e);
    }
  }

  // Remove test from patient profile
  async function removeCustomTest(key) {
    if (!currentPatientCustomDefs || !currentPatientCustomDefs[key]) return;
    const def = currentPatientCustomDefs[key];
    const confirmRemove = confirm(
      `Remove "${def.name}" from this patient's profile?`,
    );
    if (!confirmRemove) return;

    delete currentPatientCustomDefs[key];
    window.currentPatientCustomDefs = currentPatientCustomDefs;

    renderDynamicPatientTests();
    updateChartParameterOptions();
    updateChart();

    // Persist removal to server
    const localToken =
      document.getElementById("lab-local-token")?.value || activeLocalToken;
    const dateStr =
      document.getElementById("lab-date")?.value ||
      new Date().toISOString().slice(0, 10);
    const results = gatherCurrentScreenResults();
    delete results[key];
    results._custom_defs = currentPatientCustomDefs;

    try {
      const res = await fetch("/api/events/labs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinic_id: getActiveClinicId(),
          local_token: localToken,
          lab_record: { test_date: dateStr, results: results },
        }),
      });
      if (res.ok) {
        let existingRec = activeLabRecords.find((l) => l.test_date === dateStr);
        if (existingRec && existingRec.results) {
          delete existingRec.results[key];
          if (existingRec.results._custom_defs) {
            delete existingRec.results._custom_defs[key];
          }
        }
        showToast(`Removed ${def.name} from profile`);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Render Added & Custom Tests in Flowsheet
  function renderDynamicPatientTests() {
    const section = document.getElementById("dynamic-lab-section");
    const grid = document.getElementById("dynamic-lab-grid");
    const badge = document.getElementById("dynamic-tests-count-badge");
    if (!section || !grid) return;

    const keys = Object.keys(currentPatientCustomDefs || {});
    if (keys.length === 0) {
      section.style.display = "none";
      grid.innerHTML = "";
      if (badge) badge.textContent = "0 Added";
      return;
    }

    section.style.display = "";
    if (badge) badge.textContent = `${keys.length} Added`;

    grid.innerHTML = keys
      .map((key) => {
        const def = currentPatientCustomDefs[key];
        const unitStr = def.unit ? ` (${def.unit})` : "";
        const minAttr =
          def.min !== null && def.min !== undefined
            ? `data-min="${def.min}"`
            : "";
        const maxAttr =
          def.max !== null && def.max !== undefined
            ? `data-max="${def.max}"`
            : "";
        const rangeStr =
          (def.min !== null && def.min !== undefined && def.min !== "") ||
          (def.max !== null && def.max !== undefined && def.max !== "")
            ? `<span style="font-size: 10px; color: #0284c7; font-weight: 700; margin-left: 4px;">[${def.min ?? "-"} - ${def.max ?? "-"}]</span>`
            : "";

        return `
          <div class="lab-input-group" style="position: relative; background: #ffffff; border: 1.5px solid #bae6fd; border-radius: 6px; padding: 7px 9px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
              <label style="font-size: 11.5px; font-weight: 700; color: #0369a1; line-height: 1.25; margin: 0;">
                ${escapeHtml(def.name)}${escapeHtml(unitStr)} ${rangeStr}
              </label>
              <button
                type="button"
                onclick="window.Tap2MedLabs.removeTest('${escapeHtml(key)}')"
                title="Remove test from patient profile"
                style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 13px; font-weight: 700; padding: 0 0 0 4px; line-height: 1;"
                onmouseover="this.style.color='#ef4444'"
                onmouseout="this.style.color='#94a3b8'"
              >
                ✕
              </button>
            </div>
            <input
              type="${(def.min !== null && def.min !== undefined) || (def.max !== null && def.max !== undefined) ? "number" : "text"}"
              step="any"
              id="lab-${escapeHtml(key)}"
              class="input"
              ${minAttr}
              ${maxAttr}
              placeholder="${escapeHtml(def.unit || "Enter value")}"
              oninput="window.Tap2MedLabs.onInput(this)"
              style="font-size: 13px; height: 32px;"
            />
          </div>
        `;
      })
      .join("");

    // Attach listeners
    attachLiveInputListeners();
  }

  // Check Range & highlight abnormal values
  function checkRange(input, minStr, maxStr) {
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val)) {
      input.classList.remove("lab-input-abnormal");
      return;
    }

    const min = parseFloat(
      minStr !== undefined ? minStr : input.getAttribute("data-min"),
    );
    const max = parseFloat(
      maxStr !== undefined ? maxStr : input.getAttribute("data-max"),
    );

    let isAbnormal = false;
    if (!isNaN(min) && val < min) isAbnormal = true;
    if (!isNaN(max) && val > max) isAbnormal = true;

    if (isAbnormal) {
      input.classList.add("lab-input-abnormal");
    } else {
      input.classList.remove("lab-input-abnormal");
    }
  }

  // Real-time input listener: range check + live chart plot
  function onInput(input) {
    checkRange(input);
    const select = document.getElementById("chart-parameter");
    if (!select) return;
    const inputKey = input.id.replace(/^lab-/, "");
    if (
      select.value !== inputKey &&
      select.querySelector(`option[value="${inputKey}"]`)
    ) {
      select.value = inputKey;
    }
    if (select.value === inputKey) {
      updateChart();
    }
  }

  function attachLiveInputListeners() {
    document.querySelectorAll('[id^="lab-"]').forEach((el) => {
      if (["lab-date", "lab-local-token", "lab-search-input"].includes(el.id))
        return;
      if (!el._hasLabListener) {
        el._hasLabListener = true;
        el.addEventListener("input", function () {
          onInput(this);
        });
      }
    });
  }

  // -------------------------------------------------------------
  // SMART AUTOCOMPLETE SEARCH & HEADING DROPDOWN (HEALTHPLIX STYLE)
  // -------------------------------------------------------------

  const expandedDropdownCategories = new Set();

  function handleSearchInput(query) {
    const dropdown = document.getElementById("lab-search-dropdown");
    if (!dropdown) return;

    const trimmed = query ? query.trim() : "";
    if (!trimmed) {
      closeSearchDropdown();
      filterLabFields("");
      return;
    }

    filterLabFields(trimmed);
    renderSearchDropdown(trimmed);
  }

  function openSearchDropdown() {
    const input = document.getElementById("lab-search-input");
    if (!input) return;
    const val = input.value.trim();
    renderSearchDropdown(val);
  }

  function closeSearchDropdown() {
    const dropdown = document.getElementById("lab-search-dropdown");
    if (dropdown) {
      dropdown.style.display = "none";
      dropdown.innerHTML = "";
    }
    searchDropdownOpen = false;
  }

  function toggleCategoryInDropdown(catName, event) {
    if (event) event.stopPropagation();
    if (expandedDropdownCategories.has(catName)) {
      expandedDropdownCategories.delete(catName);
    } else {
      expandedDropdownCategories.add(catName);
    }
    const input = document.getElementById("lab-search-input");
    renderSearchDropdown(input ? input.value : "", catName);
  }

  function selectCategoryHeading(catName) {
    const searchInput = document.getElementById("lab-search-input");
    if (searchInput) searchInput.value = catName;
    expandedDropdownCategories.add(catName);
    filterLabFields(catName);
    renderSearchDropdown(catName);

    // Scroll to heading in flowsheet
    const headings = document.querySelectorAll(".lab-section-header");
    for (const h of headings) {
      if (h.textContent.toLowerCase().includes(catName.toLowerCase())) {
        h.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      }
    }
  }

  function addCatalogTest(testKey, btnEl) {
    const catTest = TEST_MAP.get(testKey);
    if (!catTest) return;

    persistPatientTest({
      key: catTest.key,
      name: catTest.name,
      category: catTest.category,
      unit: catTest.unit,
      min: catTest.min,
      max: catTest.max,
      isCustom: false,
    });

    if (btnEl) {
      btnEl.outerHTML = `
        <span style="font-size: 11px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 3px 8px; border-radius: 4px; border: 1px solid #bae6fd;">
          ✓ In Profile
        </span>
      `;
    }
  }

  async function addAllCategoryTests(catName) {
    const testsInCat = ALL_TESTS.filter((t) => t.category === catName);
    let addedCount = 0;
    testsInCat.forEach((t) => {
      if (
        !currentPatientCustomDefs[t.key] &&
        !STANDARD_FLOWSHEET_KEYS.includes(t.key)
      ) {
        currentPatientCustomDefs[t.key] = {
          key: t.key,
          name: t.name,
          category: t.category,
          unit: t.unit,
          min: t.min,
          max: t.max,
          isCustom: false,
        };
        addedCount++;
      }
    });

    renderDynamicPatientTests();
    updateChartParameterOptions();

    // Persist all
    const localToken =
      document.getElementById("lab-local-token")?.value || activeLocalToken;
    const dateStr =
      document.getElementById("lab-date")?.value ||
      new Date().toISOString().slice(0, 10);
    const results = gatherCurrentScreenResults();
    results._custom_defs = currentPatientCustomDefs;

    try {
      await fetch("/api/events/labs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinic_id: getActiveClinicId(),
          local_token: localToken,
          lab_record: { test_date: dateStr, results: results },
        }),
      });
      showToast(`✓ Added all ${addedCount} ${catName} tests to profile`);
    } catch (e) {
      console.error(e);
    }

    const input = document.getElementById("lab-search-input");
    renderSearchDropdown(input ? input.value : "", catName);
  }

  function renderSearchDropdown(query, forceExpandCat = null) {
    const dropdown = document.getElementById("lab-search-dropdown");
    if (!dropdown) return;

    dropdown.style.display = "block";
    searchDropdownOpen = true;

    const q = (query || "").toLowerCase();

    // Check if query matches any category heading
    const matchedCategories = CATEGORY_ORDER.filter(
      (cat) =>
        cat.toLowerCase().includes(q) ||
        (q.length >= 3 && "haematology".includes(q) && cat.startsWith("Haem")),
    );

    // Matching tests from 202 database
    const matchedTests = ALL_TESTS.filter((t) => {
      if (!q) return true;
      if (t.name.toLowerCase().includes(q)) return true;
      if (t.category.toLowerCase().includes(q)) return true;
      return (t.aliases || []).some((a) => a.toLowerCase().includes(q));
    }).slice(0, 25);

    let html = "";

    // 1. Category Heading Matches with ACCORDION EXPANSION
    if (matchedCategories.length > 0) {
      html += `
        <div style="padding: 6px 12px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
          Specialty Headings (Click to expand all tests under heading)
        </div>
      `;
      matchedCategories.forEach((cat) => {
        const testsInCat = ALL_TESTS.filter((t) => t.category === cat);
        const isExpanded =
          expandedDropdownCategories.has(cat) ||
          (matchedCategories.length === 1 && q.length >= 4);

        html += `
          <div style="border-bottom: 1px solid #e2e8f0;">
            <div
              onclick="window.Tap2MedLabs.toggleCategoryInDropdown('${escapeHtml(cat)}', event)"
              style="padding: 9px 14px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: ${isExpanded ? "#f0f9ff" : "#ffffff"}; transition: background 0.15s;"
              onmouseover="if(!${isExpanded}) this.style.background='#f8fafc'"
              onmouseout="if(!${isExpanded}) this.style.background='#ffffff'"
            >
              <div style="display: flex; align-items: center; gap: 8px;">
                <strong style="color: ${isExpanded ? "#0369a1" : "#1e293b"}; font-size: 13px;">📂 ${escapeHtml(cat)}</strong>
                <span style="font-size: 11px; color: #0284c7; background: #e0f2fe; padding: 1px 7px; border-radius: 10px; font-weight: 700;">
                  ${testsInCat.length} Tests
                </span>
              </div>
              <span style="font-size: 11.5px; font-weight: 700; color: #0284c7;">
                ${isExpanded ? "▲ Close" : "▼ View All Tests"}
              </span>
            </div>
            ${
              isExpanded
                ? `
              <div style="padding: 6px 10px 10px; background: #f8fafc; border-top: 1px dashed #cbd5e1;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 6px 8px; border-bottom: 1px solid #e2e8f0; margin-bottom: 6px;">
                  <span style="font-size: 11px; color: #64748b; font-weight: 600;">Available tests in ${escapeHtml(cat)}:</span>
                  <button
                    type="button"
                    onclick="window.Tap2MedLabs.addAllCategoryTests('${escapeHtml(cat)}')"
                    class="btn"
                    style="background: #0284c7; color: white; border: none; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 5px; cursor: pointer;"
                  >
                    + Add All ${testsInCat.length} Tests
                  </button>
                </div>
                <div style="max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;">
                  ${testsInCat
                    .map((t) => {
                      const isAdded = Boolean(
                        currentPatientCustomDefs &&
                        currentPatientCustomDefs[t.key],
                      );
                      const isStandard = STANDARD_FLOWSHEET_KEYS.includes(
                        t.key,
                      );
                      const refStr =
                        t.min !== null || t.max !== null
                          ? `Ref: ${t.min ?? "-"} - ${t.max ?? "-"} ${t.unit}`
                          : t.unit || "";
                      return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: white; border: 1px solid #e2e8f0; border-radius: 6px;">
                          <div>
                            <strong style="font-size: 12px; color: #1e293b;">${escapeHtml(t.name)}</strong>
                            <div style="font-size: 10.5px; color: #64748b;">${escapeHtml(refStr)}</div>
                          </div>
                          <div>
                            ${
                              isAdded || isStandard
                                ? `
                              <span style="font-size: 11px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 2px 7px; border-radius: 4px; border: 1px solid #bae6fd;">
                                ✓ ${isStandard ? "In Flowsheet" : "In Profile"}
                              </span>
                            `
                                : `
                              <button
                                type="button"
                                onclick="window.Tap2MedLabs.addCatalogTest('${escapeHtml(t.key)}', this)"
                                class="btn btn-primary"
                                style="font-size: 10.5px; font-weight: 700; padding: 3px 10px; border-radius: 5px;"
                              >
                                + Add
                              </button>
                            `
                            }
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            `
                : ""
            }
          </div>
        `;
      });
    }

    // 2. Matching Individual Tests Section
    html += `
      <div style="padding: 6px 12px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; display: flex; justify-content: space-between; align-items: center;">
        <span>Standard Medical Tests (${matchedTests.length} matches)</span>
        <button
          type="button"
          onclick="window.Tap2MedLabs.showCustomCreator('${escapeHtml(query)}')"
          style="background: none; border: none; color: #16a34a; cursor: pointer; font-size: 11.5px; font-weight: 700; padding: 0;"
        >
          ✨ + Custom Test
        </button>
      </div>
      <div style="max-height: 260px; overflow-y: auto;">
    `;

    if (matchedTests.length === 0) {
      html += `
        <div style="padding: 16px; text-align: center; color: #64748b; font-size: 13px;">
          <div>No standard catalog tests matching "<strong>${escapeHtml(query)}</strong>"</div>
          <button
            type="button"
            onclick="window.Tap2MedLabs.showCustomCreator('${escapeHtml(query)}')"
            class="btn"
            style="margin-top: 10px; background: #16a34a; color: white; border: none; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 6px; cursor: pointer;"
          >
            + Create Custom Test "${escapeHtml(query)}"
          </button>
        </div>
      `;
    } else {
      matchedTests.forEach((t) => {
        const isAdded = Boolean(
          currentPatientCustomDefs && currentPatientCustomDefs[t.key],
        );
        const isStandard = STANDARD_FLOWSHEET_KEYS.includes(t.key);
        const refStr =
          t.min !== null || t.max !== null
            ? `Ref: ${t.min ?? "-"} - ${t.max ?? "-"} ${t.unit}`
            : t.unit || "";

        html += `
          <div
            style="padding: 8px 14px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; transition: background 0.15s;"
            onmouseover="this.style.background='#f8fafc'"
            onmouseout="this.style.background='#ffffff'"
          >
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <strong style="font-size: 12.5px; color: #1e293b;">${escapeHtml(t.name)}</strong>
                <span style="font-size: 10px; color: #64748b; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-weight: 600;">${escapeHtml(t.category)}</span>
              </div>
              <div style="font-size: 11px; color: #64748b;">${escapeHtml(refStr)}</div>
            </div>
            <div>
              ${
                isAdded || isStandard
                  ? `
                <span style="font-size: 11px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 3px 8px; border-radius: 4px; border: 1px solid #bae6fd;">
                  ✓ ${isStandard ? "In Flowsheet" : "In Profile"}
                </span>
              `
                  : `
                <button
                  type="button"
                  onclick="window.Tap2MedLabs.addCatalogTest('${escapeHtml(t.key)}', this)"
                  class="btn btn-primary"
                  style="font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 6px;"
                >
                  + Add to Profile
                </button>
              `
              }
            </div>
          </div>
        `;
      });
    }

    html += `</div>`;

    // 3. Compact Inline Custom Test Creator Drawer Container
    html += `
      <div id="inline-custom-creator-box" style="display: none; padding: 14px; background: #f0fdf4; border-top: 1.5px solid #86efac;">
        <!-- Injected dynamically on click -->
      </div>
    `;

    dropdown.innerHTML = html;
  }

  function showCustomCreator(prefillName = "") {
    const box = document.getElementById("inline-custom-creator-box");
    if (!box) return;

    box.style.display = "block";
    box.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="font-size: 12.5px; color: #15803d; display: flex; align-items: center; gap: 6px;">
          <span>✨</span> Create & Add Custom Investigation
        </strong>
        <span onclick="document.getElementById('inline-custom-creator-box').style.display='none'" style="font-size: 11px; color: #64748b; cursor: pointer; font-weight: 600;">✕ Cancel</span>
      </div>
      <div style="display: grid; grid-template-columns: 1.4fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-size: 10.5px; font-weight: 700; color: #334155; display: block; margin-bottom: 2px;">Test Name *</label>
          <input type="text" id="inline-cust-name" class="input" placeholder="e.g. Serum Zinc, ANA 1:160" value="${escapeHtml(prefillName)}" style="font-size: 12px; height: 32px; background: white;" />
        </div>
        <div>
          <label style="font-size: 10.5px; font-weight: 700; color: #334155; display: block; margin-bottom: 2px;">Category *</label>
          <select id="inline-cust-category" class="input" style="font-size: 11.5px; height: 32px; background: white;">
            ${CATEGORY_ORDER.map((c) => `<option value="${c}">${c}</option>`).join("")}
          </select>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1.2fr; gap: 6px; margin-bottom: 10px;">
        <div>
          <label style="font-size: 10.5px; font-weight: 700; color: #334155; display: block; margin-bottom: 2px;">Unit</label>
          <input type="text" id="inline-cust-unit" class="input" placeholder="e.g. mg/dL" style="font-size: 11.5px; height: 30px; background: white;" />
        </div>
        <div>
          <label style="font-size: 10.5px; font-weight: 700; color: #334155; display: block; margin-bottom: 2px;">Normal Min</label>
          <input type="number" step="any" id="inline-cust-min" class="input" placeholder="Min" style="font-size: 11.5px; height: 30px; background: white;" />
        </div>
        <div>
          <label style="font-size: 10.5px; font-weight: 700; color: #334155; display: block; margin-bottom: 2px;">Normal Max</label>
          <input type="number" step="any" id="inline-cust-max" class="input" placeholder="Max" style="font-size: 11.5px; height: 30px; background: white;" />
        </div>
        <div>
          <label style="font-size: 10.5px; font-weight: 700; color: #334155; display: block; margin-bottom: 2px;">Initial Value</label>
          <input type="text" id="inline-cust-val" class="input" placeholder="Enter value" style="font-size: 11.5px; height: 30px; background: white;" />
        </div>
      </div>
      <div style="display: flex; justify-content: flex-end;">
        <button
          type="button"
          onclick="window.Tap2MedLabs.submitInlineCustomTest()"
          class="btn"
          style="background: #16a34a; color: white; border: none; font-size: 12px; font-weight: 700; padding: 6px 16px; border-radius: 6px; cursor: pointer;"
        >
          + Save & Add to Patient Profile
        </button>
      </div>
    `;

    document.getElementById("inline-cust-name")?.focus();
  }

  function submitInlineCustomTest() {
    const name = document.getElementById("inline-cust-name")?.value.trim();
    if (!name) return alert("Please enter test name.");

    const category =
      document.getElementById("inline-cust-category")?.value ||
      "Other Investigations";
    const unit =
      document.getElementById("inline-cust-unit")?.value.trim() || "";
    const minVal = document.getElementById("inline-cust-min")?.value.trim();
    const maxVal = document.getElementById("inline-cust-max")?.value.trim();
    const initVal =
      document.getElementById("inline-cust-val")?.value.trim() || "";

    const min =
      minVal !== "" && !isNaN(parseFloat(minVal)) ? parseFloat(minVal) : null;
    const max =
      maxVal !== "" && !isNaN(parseFloat(maxVal)) ? parseFloat(maxVal) : null;
    const key = slugify(name);

    persistPatientTest(
      {
        key: key,
        name: name,
        category: category,
        unit: unit,
        min: min,
        max: max,
        isCustom: true,
      },
      initVal,
    );

    closeSearchDropdown();
  }

  // Filter flowsheet headings and groups based on search term
  function filterLabFields(term) {
    const effective = (term || "").trim().toLowerCase();
    let firstMatchedHeading = null;

    document.querySelectorAll(".lab-section-header").forEach((heading) => {
      const grid = heading.nextElementSibling;
      if (!grid || !grid.classList.contains("lab-grid")) return;

      const headingText = heading.textContent.toLowerCase();
      const headingMatches = Boolean(
        effective && headingText.includes(effective),
      );

      let hasVisible = false;
      grid.querySelectorAll(".lab-input-group").forEach((group) => {
        const input = group.querySelector("input");
        const label = group.querySelector("label")?.textContent || "";
        const key = input ? input.id.replace(/^lab-/, "") : "";
        const match =
          !effective ||
          headingMatches ||
          `${key} ${label}`.toLowerCase().includes(effective);
        group.style.display = match ? "" : "none";
        if (match) hasVisible = true;
      });

      const showHeading = !effective || headingMatches || hasVisible;
      heading.style.display = showHeading ? "" : "none";
      grid.style.display = showHeading ? "" : "none";

      if (headingMatches && !firstMatchedHeading) {
        firstMatchedHeading = heading;
      }
    });

    if (firstMatchedHeading && effective) {
      firstMatchedHeading.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  // -------------------------------------------------------------
  // REAL-TIME TREND CHART ENGINE
  // -------------------------------------------------------------

  function updateChartParameterOptions() {
    const select = document.getElementById("chart-parameter");
    if (!select) return;

    // Preserve current selected value if possible
    const currentSelected = select.value;

    const existingGroup = document.getElementById("chart-optgroup-dynamic");
    if (existingGroup) existingGroup.remove();

    const customKeys = Object.keys(currentPatientCustomDefs || {});
    if (customKeys.length > 0) {
      const optgroup = document.createElement("optgroup");
      optgroup.id = "chart-optgroup-dynamic";
      optgroup.label = "⭐ Added & Custom Tests";

      customKeys.forEach((key) => {
        const def = currentPatientCustomDefs[key];
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = `${def.name} ${def.unit ? `(${def.unit})` : ""}`;
        optgroup.appendChild(opt);
      });

      select.prepend(optgroup);
    }

    if (
      currentSelected &&
      select.querySelector(`option[value="${currentSelected}"]`)
    ) {
      select.value = currentSelected;
    }
  }

  function filterChartOptions() {
    const select = document.getElementById("chart-parameter");
    if (!select) return;

    const searchTerm =
      document
        .getElementById("chart-search-input")
        ?.value.trim()
        .toLowerCase() || "";
    const groups = select.querySelectorAll("optgroup");
    const visibleOptions = [];

    groups.forEach((group) => {
      const options = [...group.querySelectorAll("option")];
      options.forEach((option) => {
        const match =
          !searchTerm ||
          option.textContent.toLowerCase().includes(searchTerm) ||
          option.value.toLowerCase().includes(searchTerm);
        option.hidden = Boolean(searchTerm) && !match;
        if (match) visibleOptions.push(option);
      });

      const hasVisible = options.some((option) => !option.hidden);
      group.hidden = Boolean(searchTerm) && !hasVisible;
    });

    if (
      visibleOptions.length &&
      !visibleOptions.some((option) => option.value === select.value)
    ) {
      select.value = visibleOptions[0].value;
    }

    select.disabled = Boolean(searchTerm) && visibleOptions.length === 0;
    updateChart();
  }

  function ensureChartJsLoaded() {
    if (typeof Chart !== "undefined") return Promise.resolve();
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js";
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }

  // Live Chart rendering with empty-state, live input merging, reference ranges
  async function updateChart() {
    const select = document.getElementById("chart-parameter");
    if (!select) return;

    const param = select.value;
    const canvas = document.getElementById("labChart");
    const emptyState = document.getElementById("chart-empty-state");
    const summaryCard = document.getElementById("chart-summary-stats");

    if (!param) {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
      if (canvas) canvas.style.display = "none";
      if (emptyState) emptyState.style.display = "flex";
      return;
    }

    const paramLabel =
      select.options[select.selectedIndex]?.text || "Lab Value";

    // Lookup definition for normal bounds & units
    let testDef =
      currentPatientCustomDefs && currentPatientCustomDefs[param]
        ? currentPatientCustomDefs[param]
        : TEST_MAP.get(param);

    // 1. Gather historical points
    const pointsByDate = {};
    (activeLabRecords || []).forEach((l) => {
      if (
        l.results &&
        l.results[param] !== undefined &&
        l.results[param] !== ""
      ) {
        const num = parseFloat(l.results[param]);
        if (!isNaN(num)) {
          pointsByDate[l.test_date] = num;
        }
      }
    });

    // 2. Read live input on screen for the currently selected date
    const currentDate =
      document.getElementById("lab-date")?.value ||
      new Date().toISOString().slice(0, 10);
    const liveInputEl = document.getElementById(`lab-${param}`);
    if (liveInputEl && liveInputEl.value.trim() !== "") {
      const liveVal = parseFloat(liveInputEl.value.trim());
      if (!isNaN(liveVal)) {
        pointsByDate[currentDate] = liveVal;
      }
    }

    // 3. Sort chronologically
    const sortedDates = Object.keys(pointsByDate).sort(
      (a, b) => new Date(a) - new Date(b),
    );

    // Handle Empty State (0 points)
    if (sortedDates.length === 0) {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
      if (canvas) canvas.style.display = "none";
      if (emptyState) {
        emptyState.style.display = "flex";
        emptyState.innerHTML = `
          <div style="text-align: center; padding: 24px 16px;">
            <div style="font-size: 34px; margin-bottom: 8px;">📊</div>
            <strong style="color: #1e293b; font-size: 14.5px; display: block;">No recorded data for ${escapeHtml(paramLabel)}</strong>
            <p style="color: #64748b; font-size: 12.5px; margin: 6px 0 12px 0;">Enter a value in the flowsheet on the left to see live trend lines, reference ranges, and clinical history.</p>
          </div>
        `;
      }
      if (summaryCard) summaryCard.style.display = "none";
      return;
    }

    // Points exist: show canvas and hide empty state
    if (canvas) canvas.style.display = "block";
    if (emptyState) emptyState.style.display = "none";

    if (typeof Chart === "undefined") {
      await ensureChartJsLoaded();
    }
    if (typeof Chart === "undefined" || !canvas) return;

    const labels = sortedDates.map((d) =>
      new Date(d).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        year: "2-digit",
      }),
    );
    const dataPoints = sortedDates.map((d) => pointsByDate[d]);

    if (chartInstance) chartInstance.destroy();

    const ctx = canvas.getContext("2d");

    // Dynamic suggested bounds
    let suggestedMin = Math.min(...dataPoints);
    let suggestedMax = Math.max(...dataPoints);
    if (testDef && testDef.min !== null && !isNaN(testDef.min))
      suggestedMin = Math.min(suggestedMin, testDef.min);
    if (testDef && testDef.max !== null && !isNaN(testDef.max))
      suggestedMax = Math.max(suggestedMax, testDef.max);

    let pad = (suggestedMax - suggestedMin) * 0.18;
    if (!pad || pad === 0) {
      pad = Math.abs(suggestedMin) * 0.18 || 5;
    }

    chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: paramLabel,
            data: dataPoints,
            borderColor: "#0284c7",
            backgroundColor: "rgba(2, 132, 199, 0.08)",
            borderWidth: 2.5,
            pointBackgroundColor: "#ffffff",
            pointBorderColor: "#0284c7",
            pointBorderWidth: 2.5,
            pointRadius: dataPoints.length === 1 ? 8 : 6,
            pointHoverRadius: 9,
            fill: true,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                const val = context.parsed.y;
                let status = "";
                if (testDef && testDef.min !== null && val < testDef.min)
                  status = " (Low ⬇)";
                if (testDef && testDef.max !== null && val > testDef.max)
                  status = " (High ⬆)";
                return `${val} ${testDef?.unit || ""}${status}`;
              },
            },
          },
        },
        scales: {
          y: {
            suggestedMin: Math.max(0, suggestedMin - pad),
            suggestedMax: suggestedMax + pad,
            grid: { color: "#f1f5f9" },
            ticks: {
              font: { size: 11 },
            },
          },
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 11 },
            },
          },
        },
      },
    });

    // Update Summary Stats Card below chart
    if (summaryCard) {
      summaryCard.style.display = "flex";
      const latestVal = dataPoints[dataPoints.length - 1];
      let statusBadge = `<span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px;">Normal</span>`;
      if (testDef && testDef.min !== null && latestVal < testDef.min) {
        statusBadge = `<span style="background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px;">Low ⬇</span>`;
      } else if (testDef && testDef.max !== null && latestVal > testDef.max) {
        statusBadge = `<span style="background: #fee2e2; color: #b91c1c; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px;">High ⬆</span>`;
      }

      const refRangeStr =
        testDef && (testDef.min !== null || testDef.max !== null)
          ? `${testDef.min ?? "-"} - ${testDef.max ?? "-"} ${testDef.unit || ""}`
          : testDef?.unit || "Standard";

      summaryCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; font-size: 12px;">
          <div>
            <span style="color: #64748b; font-weight: 600;">Latest (${labels[labels.length - 1]}):</span>
            <strong style="color: #0f172a; margin-left: 4px; font-size: 13px;">${latestVal} ${testDef?.unit || ""}</strong>
            ${statusBadge}
          </div>
          <div style="color: #64748b; font-size: 11px;">
            Normal: <strong>${escapeHtml(refRangeStr)}</strong> (${dataPoints.length} ${dataPoints.length === 1 ? "point" : "points"})
          </div>
        </div>
      `;
    }
  }

  // Global Document Listener to close search dropdown when clicking outside
  document.addEventListener("click", function (e) {
    const searchWrap =
      document.querySelector(".lab-search-container") ||
      document.getElementById("lab-search-input");
    const dropdown = document.getElementById("lab-search-dropdown");
    if (!dropdown || !searchDropdownOpen) return;
    if (
      searchWrap &&
      !searchWrap.contains(e.target) &&
      !dropdown.contains(e.target)
    ) {
      closeSearchDropdown();
    }
  });

  // Public Interface
  function searchMedicalTestCatalog(query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) return [];
    return ALL_TESTS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.aliases || []).some((a) => a.toLowerCase().includes(q)),
    );
  }

  const Tap2MedLabs = {
    open,
    close,
    fetchLabData,
    saveLabs,
    persistPatientTest,
    removeTest: removeCustomTest,
    populateInputsForDate: populateLabInputsForDate,
    checkRange,
    onInput,
    updateChart,
    updateChartParameterOptions,
    filterChartOptions,
    filterLabFields,
    handleSearchInput,
    openSearchDropdown,
    closeSearchDropdown,
    selectCategoryHeading,
    toggleCategoryInDropdown,
    addAllCategoryTests,
    addCatalogTest,
    showCustomCreator,
    submitInlineCustomTest,
    searchMedicalTestCatalog,
    ALL_TESTS,
    TEST_MAP,
  };

  window.Tap2MedLabs = Tap2MedLabs;

  // Global search and catalog helpers
  window.searchMedicalTestCatalog = searchMedicalTestCatalog;
  window.ALL_CATALOG_TESTS = ALL_TESTS;
  window.COMPREHENSIVE_TEST_DATABASE = ALL_TESTS;
  window.getTestByKey = (k) => TEST_MAP.get(k);
  window.getTestByName = (n) =>
    ALL_TESTS.find((t) => t.name.toLowerCase() === (n || "").toLowerCase());

  // Backward-compatibility global bindings
  window.openLabsModal = function (localToken, patientName, clinicId) {
    const token =
      localToken ||
      window.currentLocalToken ||
      document.getElementById("lab-local-token")?.value;
    const name = patientName || window.currentPatientName || "Patient";
    const clinic = clinicId || window.clinicId;
    Tap2MedLabs.open(token, name, clinic);
  };
  window.closeLabsModal = Tap2MedLabs.close;
  window.saveLabs = Tap2MedLabs.saveLabs;
  window.updateChart = Tap2MedLabs.updateChart;
  window.checkRange = Tap2MedLabs.checkRange;
  window.filterChartOptions = Tap2MedLabs.filterChartOptions;
  window.filterLabFields = function () {
    const val = document.getElementById("lab-search-input")?.value || "";
    Tap2MedLabs.handleSearchInput(val);
  };
  window.populateLabInputsForDate = Tap2MedLabs.populateInputsForDate;
  window.addTestToPatient = Tap2MedLabs.addCatalogTest;
  window.removeCustomTest = Tap2MedLabs.removeTest;
  window.renderDynamicPatientTests = function () {};
  window.updateChartParameterOptions = Tap2MedLabs.updateChartParameterOptions;
})();
