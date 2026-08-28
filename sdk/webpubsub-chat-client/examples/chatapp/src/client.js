import { ChatClient } from "@azure/web-pubsub-chat-client";

const loginForm = document.querySelector("#login");
const chat = document.querySelector("#chat");
const roomSelect = document.querySelector("#rooms");
const messages = document.querySelector("#messages");
const errorElement = document.querySelector("#error");
let client;
const rooms = new Map();

function showError(error) {
  console.error(error);
  errorElement.textContent = error instanceof Error ? error.message : String(error);
}

function addLine(text, className = "") {
  document.querySelector("#empty-state")?.remove();
  const line = document.createElement("p");
  line.textContent = text;
  line.className = `message-line ${className}`;
  messages.appendChild(line);
}

const adjectives = ["bright", "calm", "clever", "cosmic", "happy", "lucky", "mighty", "swift"];
const animals = ["badger", "falcon", "fox", "koala", "otter", "panda", "raven", "tiger"];
const roomNames = ["Aurora Lounge", "Comet Club", "Moonbeam Lab", "Northern Lights", "Orbit Cafe", "Pixel Garden", "Starlight Studio", "Sunrise Room"];
const pick = (values) => values[Math.floor(Math.random() * values.length)];
const randomUserId = () => `${pick(adjectives)}-${pick(animals)}-${Math.floor(10 + Math.random() * 90)}`;
const randomRoomTitle = () => `${pick(roomNames)} ${Math.floor(1 + Math.random() * 99)}`;

document.querySelectorAll("[data-random-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.querySelector(`#${button.dataset.randomTarget}`);
    input.value = button.dataset.randomKind === "room" ? randomRoomTitle() : randomUserId();
    input.focus();
  });
});

document.querySelector("#user-id").value = randomUserId();
document.querySelector("#room-title").value = randomRoomTitle();

function addRoom(room) {
  if (rooms.has(room.roomId)) return;
  rooms.set(room.roomId, room);
  const option = document.createElement("option");
  option.value = room.roomId;
  option.textContent = room.title;
  roomSelect.appendChild(option);
}

function showEmptyState() {
  messages.innerHTML = '<p id="empty-state" class="m-auto text-center text-sm text-slate-400">Messages will appear here.</p>';
}

function selectRoom(roomId) {
  roomSelect.value = roomId;
}

async function copyValue(value, button, idleLabel) {
  await navigator.clipboard.writeText(value);
  button.textContent = "Copied!";
  setTimeout(() => { button.textContent = idleLabel; }, 1500);
}

document.querySelector("#copy-user-id").addEventListener("click", (event) =>
  copyValue(client.userId, event.currentTarget, "Copy user ID").catch(showError),
);
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorElement.textContent = "";
  const userId = document.querySelector("#user-id").value.trim();

  try {
    client = await ChatClient.start({
      getClientAccessUrl: async () => {
        const response = await fetch(`/negotiate?userId=${encodeURIComponent(userId)}`);
        if (!response.ok) throw new Error(await response.text());
        return (await response.json()).url;
      },
    });

    client.on("message", ({ roomId, message }) => {
      if (roomId === roomSelect.value) addLine(`${message.createdBy}: ${message.content.text}`);
    });
    client.on("room-joined", ({ room }) => {
      addRoom(room);
      selectRoom(room.roomId);
      messages.replaceChildren();
      addLine(`You joined ${room.title}.`, "system");
    });
    client.on("member-joined", ({ roomId, userId: joinedUser }) => {
      if (roomId === roomSelect.value) addLine(`${joinedUser} joined.`, "system");
    });
    client.on("member-left", ({ roomId, userId: leftUser }) => {
      if (roomId === roomSelect.value) addLine(`${leftUser} left.`, "system");
    });

    client.rooms.forEach(addRoom);
    if (client.rooms.length > 0) selectRoom(client.rooms[0].roomId);
    document.querySelector("#current-user").textContent = client.userId;
    loginForm.hidden = true;
    chat.hidden = false;
    requestAnimationFrame(() => chat.scrollIntoView({ block: "start" }));
  } catch (error) {
    showError(error);
  }
});

document.querySelector("#create-room").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const title = document.querySelector("#room-title").value.trim();
    const invitee = document.querySelector("#invite-user-id").value.trim();
    const room = await client.createRoom(title, invitee ? [invitee] : []);
    addRoom(room);
    selectRoom(room.roomId);
    event.target.reset();
    document.querySelector("#room-title").value = randomRoomTitle();
  } catch (error) {
    showError(error);
  }
});

document.querySelector("#send-message").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!roomSelect.value) return;
  const input = document.querySelector("#message");
  try {
    await client.sendToRoom(roomSelect.value, input.value);
    input.value = "";
  } catch (error) {
    showError(error);
  }
});

document.querySelector("#load-history").addEventListener("click", async () => {
  if (!roomSelect.value) return;
  messages.replaceChildren();
  try {
    for await (const message of client.listRoomMessages(roomSelect.value)) {
      addLine(`${message.createdBy}: ${message.content.text}`);
    }
  } catch (error) {
    showError(error);
  }
});

roomSelect.addEventListener("change", () => {
  if (roomSelect.value) {
    selectRoom(roomSelect.value);
  }
  showEmptyState();
});
