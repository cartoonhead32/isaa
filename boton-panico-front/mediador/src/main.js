// Configuración de API
let API_URL;

// Revisa si estamos en el servidor local
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  // Estamos en desarrollo (tu PC)
  API_URL = 'http://localhost:8000'; // O el puerto que uses para tu API local
} else {
  // Estamos en producción (Cloudflare Pages)
  API_URL = 'https://isaa-zaa9.onrender.com';
}
// Función para mostrar la vista de inicio de sesión
function showLoginView() {
  document.getElementById("loginView").style.display = "block";
  document.getElementById("forgotView").style.display = "none";
  document.getElementById("confirmationView").style.display = "none";
  document.querySelector(".login-welcome").style.display = "block";
}

// Función para mostrar la vista de "olvidé contraseña"
function showForgotView() {
  document.getElementById("loginView").style.display = "none";
  document.getElementById("forgotView").style.display = "block";
  document.getElementById("confirmationView").style.display = "none";
  document.querySelector(".login-welcome").style.display = "none";
}

// Función para mostrar la vista de confirmación (después de enviar el correo de recuperación)
function showConfirmationView() {
  document.getElementById("loginView").style.display = "none";
  document.getElementById("forgotView").style.display = "none";
  document.getElementById("confirmationView").style.display = "block";
  document.querySelector(".login-welcome").style.display = "none";
}

// Función de inicio de sesión
function login() {
  const codigo = document.getElementById("codigo").value;
  const password = document.getElementById("password").value;

  clearError();

  localStorage.removeItem("access_token");

  if (!codigo || !password) {
    showError("Por favor, complete todos los campos");
    return;
  }

  const loginData = {
    username: codigo,
    password: password,
  };

  document.getElementById("loginButton").disabled = true;
  document.getElementById("loginButton").textContent = "CARGANDO...";

  fetch(`${API_URL}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(loginData),
  })
    .then((response) => {
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Credenciales incorrectas");
        } else {
          throw new Error("Error del servidor: " + response.status);
        }
      }
      return response.json();
    })
    .then((data) => {
      console.log("Login exitoso:", data);
      localStorage.setItem("access_token", data.access_token);

      // Redirige al dashboard principal independientemente del rol,
      // la lógica de qué mostrar se manejará en dashboard.html
      window.location.href = "dashboard.html"; 
    })
    .catch((error) => {
      showError("Error: " + error.message);
    })
    .finally(() => {
      document.getElementById("loginButton").disabled = false;
      document.getElementById("loginButton").textContent = "INICIAR SESIÓN";
    });
}

// Función para mostrar errores en el formulario
function showError(message) {
  let errorElement = document.getElementById("loginError");
  if (!errorElement) {
    errorElement = document.createElement("p");
    errorElement.id = "loginError";
    errorElement.style.color = "red";
    errorElement.style.fontSize = "0.9rem";
    errorElement.style.marginTop = "10px";

    const loginButton = document.getElementById("loginButton");
    if (loginButton) {
      const forgotPasswordLink = document.querySelector(".register-link"); // Ajustado para apuntar al enlace de registro
      loginButton.parentNode.insertBefore(errorElement, forgotPasswordLink);
    } else {
      document.querySelector(".login-container").appendChild(errorElement);
    }
  }

  errorElement.textContent = message;
  errorElement.style.display = "block";
}

// Función para limpiar el mensaje de error
function clearError() {
  const errorElement = document.getElementById("loginError");
  if (errorElement) {
    errorElement.textContent = "";
    errorElement.style.display = "none";
  }
}

// Función (simulada) para enviar correo de recuperación
function sendRecovery() {
  const email = document.getElementById("email").value;
  if (!email || !email.includes('@')) {
      alert("Por favor, ingrese un correo válido.");
      return;
  }
  
  // Aquí iría la lógica para llamar a la API de recuperación de contraseña
  // Por ahora, solo mostramos la vista de confirmación.
  console.log("Solicitud de recuperación para:", email);
  showConfirmationView();
}

// ---- INICIO DEL CÓDIGO AÑADIDO/MODIFICADO ----

// Event listener para el botón de login
document.getElementById("loginButton").addEventListener("click", login);

// Escuchar eventos de teclado en los campos de entrada para la tecla Enter
document.getElementById("codigo").addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        event.preventDefault(); // Evita el comportamiento por defecto (si lo hubiera)
        login(); // Llama a la función de login
    }
});

document.getElementById("password").addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        event.preventDefault(); // Evita el comportamiento por defecto
        login(); // Llama a la función de login
    }
});

// Event listener para el enlace de registro (si existe)
const registerLink = document.querySelector(".register-link");
if (registerLink) {
    registerLink.addEventListener("click", showRegisterView);
}

// Función para mostrar la vista de registro (necesaria si el enlace está presente)
function showRegisterView() {
    document.getElementById("loginView").style.display = "none";
    document.getElementById("forgotView").style.display = "none";
    document.getElementById("confirmationView").style.display = "none";
    
    // Asegúrate de que el ID "registerView" exista en tu HTML
    const registerView = document.getElementById("registerView");
    if (registerView) {
        registerView.style.display = "block";
    }
    
    document.querySelector(".login-welcome").style.display = "none";
}

// Manejador para el botón "Cancelar" en la vista de registro
const registerCancelButton = document.querySelector("#registerView .close-button");
if (registerCancelButton) {
    registerCancelButton.addEventListener("click", showLoginView);
}

// Manejador para el botón "Cancelar" en la vista de olvido de contraseña
const forgotCancelButton = document.querySelector("#forgotView .close-button");
if (forgotCancelButton) {
    forgotCancelButton.addEventListener("click", showLoginView);
}

// Manejador para el botón "Cerrar" en la vista de confirmación
const confirmationCloseButton = document.querySelector("#confirmationView .close-button");
if (confirmationCloseButton) {
    confirmationCloseButton.addEventListener("click", showLoginView);
}

// Añadido el listener para el botón de registro si existe
const registerButton = document.getElementById("registerButton");
if (registerButton) {
    registerButton.addEventListener("click", register); // Asumiendo que tienes una función register
}

// Añadido el listener para el botón de recuperación si existe
const recoveryButton = document.getElementById("recoveryButton");
if (recoveryButton) {
    recoveryButton.addEventListener("click", sendRecovery);
}

// --- FIN DEL CÓDIGO AÑADIDO/MODIFICADO ---