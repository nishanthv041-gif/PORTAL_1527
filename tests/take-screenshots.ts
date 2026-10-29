import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\rpnis\\.gemini\\antigravity\\brain\\9250ed6d-7ffe-4bb0-b102-1615a42115fa";

const mockExtractionResult = {
  success: true,
  fileDetails: {
    name: "STUDENT_MARKSHEET_SAMPLE.jpg",
    type: "JPG",
    size: 85680
  },
  studentId: "cmvpf0r8y000a61b8kluuheyr",
  studentName: "KIRITHIK M",
  rollNumber: "7376252AD216",
  extractedName: "KIRITHIK M",
  studentConfidence: "HIGH",
  examName: "Midterm Examination",
  examDate: "2026-10-29",
  defaultMaxMarks: 100,
  defaultPassMarks: 35,
  attendance: "94%",
  generalRemarks: "Excellent academic performance across all subjects.",
  docTotal: 427,
  docPercentage: 85.4,
  subjects: [
    {
      id: "sub-1",
      subjectId: "cmvjj71660003124viguzo21d",
      subjectName: "TAMIL",
      score: 86,
      maxScore: 100,
      passMarks: 35,
      remarks: "Strong proficiency",
      grade: "A",
      status: "PASS",
      originalExtractedValue: "86"
    },
    {
      id: "sub-2",
      subjectId: "cmvq209ax0003tehfv2a82vpj",
      subjectName: "ENGLISH",
      score: 78,
      maxScore: 100,
      passMarks: 35,
      remarks: "Good comprehension",
      grade: "B",
      status: "PASS",
      originalExtractedValue: "78"
    },
    {
      id: "sub-3",
      subjectId: "cmvnl5hwt0003mla10ninavks",
      subjectName: "MATHEMATICS",
      score: 91,
      maxScore: 100,
      passMarks: 35,
      remarks: "Outstanding problem solving",
      grade: "A+",
      status: "PASS",
      originalExtractedValue: "91"
    },
    {
      id: "sub-4",
      subjectId: "cmvjj491e000320fwy32u26cn",
      subjectName: "SCIENCE",
      score: 84,
      maxScore: 100,
      passMarks: 35,
      remarks: "Very good analytical skills",
      grade: "A",
      status: "PASS",
      originalExtractedValue: "84"
    },
    {
      id: "sub-5",
      subjectId: "cmvpb8ada00056ltltigr13hi",
      subjectName: "SOCIAL SCIENCE",
      score: 88,
      maxScore: 100,
      passMarks: 35,
      remarks: "Excellent recall",
      grade: "A",
      status: "PASS",
      originalExtractedValue: "88"
    }
  ],
  allDetectedStudents: [
    {
      studentId: "cmvpf0r8y000a61b8kluuheyr",
      studentName: "KIRITHIK M",
      rollNumber: "7376252AD216",
      extractedName: "KIRITHIK M",
      attendance: "94%",
      remarks: "Excellent academic performance across all subjects.",
      docTotal: 427,
      docPercentage: 85.4,
      subjects: [
        {
          id: "sub-1-1",
          subjectId: "cmvjj71660003124viguzo21d",
          subjectName: "TAMIL",
          score: 86,
          maxScore: 100,
          passMarks: 35,
          remarks: "Strong proficiency",
          grade: "A",
          status: "PASS",
          originalExtractedValue: "86"
        },
        {
          id: "sub-1-2",
          subjectId: "cmvq209ax0003tehfv2a82vpj",
          subjectName: "ENGLISH",
          score: 78,
          maxScore: 100,
          passMarks: 35,
          remarks: "Good comprehension",
          grade: "B",
          status: "PASS",
          originalExtractedValue: "78"
        },
        {
          id: "sub-1-3",
          subjectId: "cmvnl5hwt0003mla10ninavks",
          subjectName: "MATHEMATICS",
          score: 91,
          maxScore: 100,
          passMarks: 35,
          remarks: "Outstanding problem solving",
          grade: "A+",
          status: "PASS",
          originalExtractedValue: "91"
        },
        {
          id: "sub-1-4",
          subjectId: "cmvjj491e000320fwy32u26cn",
          subjectName: "SCIENCE",
          score: 84,
          maxScore: 100,
          passMarks: 35,
          remarks: "Very good analytical skills",
          grade: "A",
          status: "PASS",
          originalExtractedValue: "84"
        },
        {
          id: "sub-1-5",
          subjectId: "cmvpb8ada00056ltltigr13hi",
          subjectName: "SOCIAL SCIENCE",
          score: 88,
          maxScore: 100,
          passMarks: 35,
          remarks: "Excellent recall",
          grade: "A",
          status: "PASS",
          originalExtractedValue: "88"
        }
      ]
    },
    {
      studentId: "cmvpf1959000z61b8rasin9i6",
      studentName: "RAJESWARI M",
      rollNumber: "7376251EE172",
      extractedName: "RAJESWARI M",
      attendance: "98%",
      remarks: "Top class performer, exceptional scores.",
      docTotal: 460,
      docPercentage: 92.0,
      subjects: [
        {
          id: "sub-2-1",
          subjectId: "cmvjj71660003124viguzo21d",
          subjectName: "TAMIL",
          score: 92,
          maxScore: 100,
          passMarks: 35,
          remarks: "Mastery level",
          grade: "A+",
          status: "PASS",
          originalExtractedValue: "92"
        },
        {
          id: "sub-2-2",
          subjectId: "cmvq209ax0003tehfv2a82vpj",
          subjectName: "ENGLISH",
          score: 89,
          maxScore: 100,
          passMarks: 35,
          remarks: "Excellent articulation",
          grade: "A",
          status: "PASS",
          originalExtractedValue: "89"
        },
        {
          id: "sub-2-3",
          subjectId: "cmvnl5hwt0003mla10ninavks",
          subjectName: "MATHEMATICS",
          score: 95,
          maxScore: 100,
          passMarks: 35,
          remarks: "Perfect conceptual clarity",
          grade: "A+",
          status: "PASS",
          originalExtractedValue: "95"
        },
        {
          id: "sub-2-4",
          subjectId: "cmvjj491e000320fwy32u26cn",
          subjectName: "SCIENCE",
          score: 90,
          maxScore: 100,
          passMarks: 35,
          remarks: "Superb scientific rigor",
          grade: "A+",
          status: "PASS",
          originalExtractedValue: "90"
        },
        {
          id: "sub-2-5",
          subjectId: "cmvpb8ada00056ltltigr13hi",
          subjectName: "SOCIAL SCIENCE",
          score: 94,
          maxScore: 100,
          passMarks: 35,
          remarks: "Brilliant coursework",
          grade: "A+",
          status: "PASS",
          originalExtractedValue: "94"
        }
      ]
    }
  ]
};

async function main() {
  console.log("Screenshot test runner ready.");
}

main().catch(console.error);
