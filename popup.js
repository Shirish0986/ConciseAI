document.getElementById("summarize").addEventListener("click", async () => {
  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = '<div class="loading"><div class="loader"></div></div>';

  const summaryType = document.getElementById("summary-type").value;

  chrome.storage.sync.get(["geminiApiKey"], async (result) => {
    if (!result.geminiApiKey) {
      resultDiv.innerHTML =
        "API key not found. Please set your API key in the extension options.";
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, { type: "GET_ARTICLE_TEXT" }, async (res) => {
        if (!res || !res.text) {
          resultDiv.innerText = "Could not extract article text from this page.";
          return;
        }

        try {
          const summary = await getGeminiSummary(res.text, summaryType, result.geminiApiKey);
          const formatted = formatMarkdownAndBullets(summary, summaryType);
          resultDiv.innerHTML = formatted;
        } catch (error) {
          resultDiv.innerText = `Error: ${error.message || "Failed to generate summary."}`;
        }
      });
    });
  });
});

document.getElementById("copy-btn").addEventListener("click", () => {
  const summaryText = document.getElementById("result").innerText;

  if (summaryText && summaryText.trim() !== "") {
    navigator.clipboard.writeText(summaryText).then(() => {
      const copyBtn = document.getElementById("copy-btn");
      const originalText = copyBtn.innerText;

      copyBtn.innerText = "Copied!";
      setTimeout(() => {
        copyBtn.innerText = originalText;
      }, 2000);
    }).catch((err) => {
      console.error("Failed to copy text: ", err);
    });
  }
});

async function getGeminiSummary(text, summaryType, apiKey) {
  const maxLength = 20000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + "..." : text;

  let prompt;
  switch (summaryType) {
    case "brief":
      prompt = `Give a brief summary (2-3 lines) of this article. Bold the most important keywords and facts using **. Text:\n\n${truncatedText}`;
      break;
    case "detailed":
      prompt = `Write a detailed summary of the following article. Use ** to bold key names, dates, or facts. Text:\n\n${truncatedText}`;
      break;
    case "bullets":
      prompt = `Summarize the article in 5-7 key points. Use "- " at the start of each point and separate points by a blank line. Bold important terms with **. Text:\n\n${truncatedText}`;
      break;
    default:
      prompt = `Summarize the following article:\n\n${truncatedText}`;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error?.message || "API request failed");
    }

    const data = await res.json();
    return (
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No summary available."
    );
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to generate summary. Please try again later.");
  }
}

// ✅ Formats **bold** to <strong> and bullet points with line spacing
function formatMarkdownAndBullets(text, type) {
  // Bold conversion (**text** → <strong>text</strong>)
  let formatted = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // If bullet format, ensure line breaks after each point
  if (type === "bullets") {
    formatted = formatted
      .split("\n")
      .map(line => line.startsWith("- ") ? `${line}<br><br>` : line)
      .join("");
  }

  return formatted;
}
