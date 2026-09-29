// Shared between StudentSignup (initial registration) and StudentPortal
// (starting a next degree after completing one), so both pickers always
// offer the same degree levels and department list.

export const DEGREE_LEVELS = ["BS", "MS", "MPhil", "PhD"];

// Grouped by faculty so the dropdown stays scannable. Combined with the
// chosen degree level to form the student's program (e.g. "MS Computer
// Science"). "Other" reveals a free-text field for anything not listed.
export const DEPARTMENT_GROUPS = [
  {
    label: "Engineering & Computing",
    options: [
      "Computer Science", "Software Engineering", "Information Technology",
      "Computer Engineering", "Artificial Intelligence", "Data Science",
      "Cyber Security", "Electrical Engineering", "Electronics Engineering",
      "Mechanical Engineering", "Civil Engineering", "Chemical Engineering",
      "Biomedical Engineering", "Architecture",
    ],
  },
  {
    label: "Business & Social Sciences",
    options: [
      "Business Administration", "Accounting & Finance", "Economics",
      "Commerce", "Public Administration", "Psychology", "Sociology",
      "Mass Communication", "Law",
    ],
  },
  {
    label: "Natural & Applied Sciences",
    options: [
      "Mathematics", "Physics", "Chemistry", "Biotechnology",
      "Environmental Science", "Pharmacy",
    ],
  },
  {
    label: "Humanities & Arts",
    options: ["English", "Education", "Fine Arts", "Fashion Design"],
  },
];
