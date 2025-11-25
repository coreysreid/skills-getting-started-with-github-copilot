document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  let currentUserEmail = localStorage.getItem("currentUserEmail") || null; // track last successful signup
  let lastDeleted = null; // { activity, email }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft = details.max_participants - details.participants.length;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
        `;
        // Build participant list section
        const participantsSection = document.createElement("div");
        participantsSection.className = "participants-section";
        const participantsTitle = document.createElement("p");
        participantsTitle.className = "participants-title";
        participantsTitle.innerHTML = `<strong>Participants (${details.participants.length}):</strong>`;
        const participantsList = document.createElement("ul");
        participantsList.className = "participants-list";
        if (details.participants.length === 0) {
          const li = document.createElement("li");
            li.textContent = "No participants yet";
            participantsList.appendChild(li);
        } else {
          details.participants.forEach(participantEmail => {
            const li = document.createElement("li");
            const emailSpan = document.createElement("span");
            emailSpan.textContent = participantEmail;
            li.appendChild(emailSpan);

            // Only show delete if this is the current user
            if (currentUserEmail && participantEmail === currentUserEmail) {
              const deleteBtn = document.createElement("button");
              deleteBtn.className = "delete-btn";
              deleteBtn.setAttribute("aria-label", `Remove ${participantEmail}`);
              deleteBtn.innerHTML = "&times;"; // simple delete icon
              deleteBtn.addEventListener("click", async () => {
                if (!confirm(`Remove ${participantEmail} from ${name}?`)) {
                  return;
                }
                try {
                  const res = await fetch(`/activities/${encodeURIComponent(name)}/participants/${encodeURIComponent(participantEmail)}` , { method: "DELETE" });
                  const result = await res.json();
                  if (res.ok) {
                    lastDeleted = { activity: name, email: participantEmail };
                    messageDiv.className = "success";
                    messageDiv.innerHTML = `${result.message} <button id="undo-btn" aria-label="Undo removal">Undo</button>`;
                    messageDiv.classList.remove("hidden");
                    // attach undo listener
                    const undoBtn = document.getElementById("undo-btn");
                    if (undoBtn) {
                      undoBtn.addEventListener("click", async () => {
                        if (!lastDeleted) return;
                        try {
                          const undoRes = await fetch(`/activities/${encodeURIComponent(lastDeleted.activity)}/signup?email=${encodeURIComponent(lastDeleted.email)}`, { method: "POST" });
                          const undoJson = await undoRes.json();
                          if (undoRes.ok) {
                            messageDiv.textContent = `Restored ${lastDeleted.email} to ${lastDeleted.activity}.`;
                            messageDiv.className = "success";
                            lastDeleted = null;
                            fetchActivities();
                          } else {
                            messageDiv.textContent = undoJson.detail || "Undo failed";
                            messageDiv.className = "error";
                          }
                        } catch (e) {
                          messageDiv.textContent = "Undo failed due to network error";
                          messageDiv.className = "error";
                        }
                        setTimeout(() => messageDiv.classList.add("hidden"), 5000);
                      });
                    }
                    fetchActivities();
                  } else {
                    messageDiv.textContent = result.detail || "Failed to remove participant";
                    messageDiv.className = "error";
                    messageDiv.classList.remove("hidden");
                  }
                } catch (err) {
                  console.error("Error removing participant", err);
                  messageDiv.textContent = "Error removing participant";
                  messageDiv.className = "error";
                  messageDiv.classList.remove("hidden");
                }
                setTimeout(() => messageDiv.classList.add("hidden"), 5000);
              });
              li.appendChild(deleteBtn);
            }
            participantsList.appendChild(li);
          });
        }
        participantsSection.appendChild(participantsTitle);
        participantsSection.appendChild(participantsList);
        activityCard.appendChild(participantsSection);

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });
    } catch (error) {
      activitiesList.innerHTML = "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (response.ok) {
        messageDiv.textContent = result.message;
        messageDiv.className = "success";
        signupForm.reset();
        currentUserEmail = email; // update current user
        localStorage.setItem("currentUserEmail", currentUserEmail);
        // Refresh activities so participant list updates
        fetchActivities();
      } else {
        messageDiv.textContent = result.detail || "An error occurred";
        messageDiv.className = "error";
      }

      messageDiv.classList.remove("hidden");

      // Hide message after 5 seconds
      setTimeout(() => {
        messageDiv.classList.add("hidden");
      }, 5000);
    } catch (error) {
      messageDiv.textContent = "Failed to sign up. Please try again.";
      messageDiv.className = "error";
      messageDiv.classList.remove("hidden");
      console.error("Error signing up:", error);
    }
  });

  // Initialize app
  fetchActivities();
});
