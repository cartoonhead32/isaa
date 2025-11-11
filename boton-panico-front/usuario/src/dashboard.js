let API_URL;

// Revisa si estamos en el servidor local
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  // Estamos en desarrollo (tu PC)
  API_URL = 'http://localhost:8000'; // O el puerto que uses para tu API local
} else {
  // Estamos en producción (Cloudflare Pages)
  API_URL = 'https://isaa-zaa9.onrender.com';
}

// Variables de estado de la aplicación
let activeReportId = null        // ID del reporte actualmente seleccionado
let activeSection = "home"       // Sección activa en la navegación
let autoUpdate = true           // Control de actualización automática
let currentUserRole = ""        // Rol del usuario actual
// 'existingFormData' ya no es necesario

// --- FUNCIONES DE AUTENTICACIÓN Y SEGURIDAD ---

/**
 * Realiza peticiones HTTP autenticadas con token JWT
 * Maneja automáticamente la autorización y errores de autenticación
 */
async function authenticatedFetch(url, options = {}) {
  const token = localStorage.getItem("access_token")

  if (!token) {
    handleAuthError()
    return null
  }

  const userHeaders = options.headers ? { ...options.headers } : {}
  userHeaders["Authorization"] = `Bearer ${token}`

  // Solo agrega Content-Type si NO viene en options.headers (para FormData, etc.)
  if (!userHeaders["Content-Type"] && !(options.body instanceof FormData)) {
    userHeaders["Content-Type"] = "application/json"
  }

  const finalOptions = {
    ...options,
    headers: userHeaders,
  }

  try {
    const response = await fetch(url, finalOptions)

    if (response.status === 401 || response.status === 403) {
      console.warn("Token expirado o inválido, cerrando sesión...")
      handleAuthError()
      return null
    }

    if (!response.ok) {
      // Intentar leer el detalle del error de la API
      let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorDetail = errorData.detail;
        }
      } catch (e) {
        // No hacer nada si no hay JSON
      }
      throw new Error(errorDetail);
    }

    return response
  } catch (error) {
    console.error("Error en petición autenticada:", error)
    throw error
  }
}

/**
 * Maneja errores de autenticación
 * Limpia el token y redirige al login
 */
function handleAuthError() {
  localStorage.removeItem("access_token")
  alert("Tu sesión ha expirado. Serás redirigido al login.")
  window.location.href = "index.html"
}

/**
 * Verifica si el token actual es válido
 * Retorna true si es válido, false si no
 */
async function verifyTokenValidity() {
  try {
    const response = await authenticatedFetch(`${API_URL}/me`)
    return response !== null
  } catch (error) {
    console.error("Error verificando token:", error)
    return false
  }
}

/**
 * Cierra la sesión del usuario
 * Elimina el token y redirige al login
 */
function logout() {
  localStorage.removeItem("access_token")
  window.location.href = "index.html"
}


// --- FUNCIONES DE GESTIÓN DE MODALES ---

function disableBodyScroll() {
  document.body.classList.add("modal-open")
}

function enableBodyScroll() {
  document.body.classList.remove("modal-open")
}

function showModal(modalId) {
  disableBodyScroll()
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = "block";
}

function hideModal(modalId) {
  enableBodyScroll()
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = "none";
}

function getActiveModal() {
  const modals = [
    "report-modal",
    "detailed-form-modal",
    "help-modal",
    // 💡 ELIMINADOS: 'cancel-confirmation-modal', 'cancel-reason-modal'
  ]

  for (const modalId of modals) {
    const modal = document.getElementById(modalId)
    if (modal && modal.style.display === "block") {
      return modalId
    }
  }
  return null
}

function closeActiveModal() {
  const activeModalId = getActiveModal()
  if (activeModalId) {
    hideModal(activeModalId)

    switch (activeModalId) {
      case "report-modal":
        activeReportId = null
        document.getElementById("reportForm").reset()
        document.getElementById("exitoEnvio").textContent = ""
        document.getElementById("errorUbicacion").textContent = ""
        break
      case "detailed-form-modal":
        activeReportId = null
        document.getElementById("detailed-form").reset()
        enableFormSubmission()
        resetFormToEditable()
        break
      case "help-modal":
        break
      // 💡 ELIMINADOS: Casos de cancelación
    }
  }
}

// --- FUNCIONES DE GESTIÓN DE FORMULARIOS (MODIFICADO) ---

function disableFormSubmission() {
  const submitButton = document.querySelector('#detailed-form button[type="submit"]')
  if (submitButton) {
    submitButton.disabled = true
    submitButton.textContent = "Reporte Completado"
    submitButton.style.backgroundColor = "#ccc"
    submitButton.style.cursor = "not-allowed"
  }
}

function enableFormSubmission() {
  const submitButton = document.querySelector('#detailed-form button[type="submit"]')
  if (submitButton) {
    submitButton.disabled = false
    submitButton.textContent = "Completar Reporte"
    submitButton.style.backgroundColor = ""
    submitButton.style.cursor = ""
  }
}

function resetFormToEditable() {
  const infoMessage = document.getElementById("form-info-message")
  if (infoMessage) {
    infoMessage.remove()
  }
  const formInputs = document.querySelectorAll("#detailed-form input, #detailed-form textarea")
  formInputs.forEach((input) => {
    input.disabled = false
    input.style.backgroundColor = ""
    input.style.color = ""
  })
}

function makeFormReadOnly() {
  const formInputs = document.querySelectorAll("#detailed-form input, #detailed-form textarea")
  formInputs.forEach((input) => {
    input.disabled = true
    input.style.backgroundColor = "#f5f5f5"
    input.style.color = "#666"
  })

  disableFormSubmission()

  const formActions = document.querySelector(".form-actions")
  if (formActions && !document.getElementById("form-info-message")) {
    const infoMessage = document.createElement("div")
    infoMessage.id = "form-info-message"
    infoMessage.style.cssText = `
      background: #e3f2fd;
      border: 1px solid #2196f3;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 15px;
      color: #1976d2;
      font-size: 14px;
      text-align: center;
    `
    infoMessage.innerHTML = `
      <i class="fas fa-info-circle"></i> 
      Este reporte ya ha sido completado.
    `
    formActions.parentNode.insertBefore(infoMessage, formActions)
  }
}

// 💡 ELIMINADO: updateCurrentDate (ya no hay campo de fecha)

// --- FUNCIONES DE GESTIÓN DE REPORTES (MODIFICADO) ---

/**
 * Carga y muestra todos los reportes del usuario actual (MODIFICADO)
 */
async function loadReports() {
  const reportsContainer = document.getElementById("reports-list")
  const panicButton = document.getElementById("panic-button")

  try {
    const response = await authenticatedFetch(`${API_URL}/my-tasks/`)
    if (!response) return;
    const reports = await response.json()

    // Lógica del Botón de Pánico
    const hasActiveCase = reports.some(report => 
        report.estado === "Activo" || report.estado === "Pendiente"
    )
    if (hasActiveCase) {
        panicButton.disabled = true;
        panicButton.title = "Ya tienes un caso activo. No puedes crear uno nuevo.";
    } else {
        panicButton.disabled = false;
        panicButton.title = "Presiona para reportar una emergencia";
    }

    // Lógica de renderizado de reportes
    reportsContainer.innerHTML = ""
    if (reports.length === 0) {
      reportsContainer.innerHTML = "<p>No hay reportes</p>"
    } else {
      reports.forEach((report) => {
        // --- 1. Definir estados y lógica de botones ---
        const isActive = report.estado === "Activo"
        const isPending = report.estado === "Pendiente"
        const isPendingForm = report.estado === "Pendiente Formulario"
        const isCompleted = report.estado === "Completado"

        let reportClass = "report-item"
        if (isCompleted) {
          reportClass += " completed-report"
        } else if (isPending || isPendingForm) {
          reportClass += " pending-report"
        } else if (isActive) {
          reportClass += " active-report"
        }

        let buttonLabel = "Concluir Reporte"
        let isButtonDisabled = true

        if (isPendingForm) {
          buttonLabel = "Concluir Reporte"
          isButtonDisabled = false
        } else if (isCompleted) {
          buttonLabel = "Información"
          isButtonDisabled = false
        } else if (isPending) {
          buttonLabel = "En Proceso..."
        } else if (isActive) {
          buttonLabel = "Esperando..."
        }
        
        const div = document.createElement("div")
        div.className = reportClass

        // --- 2. INICIO DE MODIFICACIÓN ---
        // (Construir bloque de mediador)

        const horaCreacion = report.hora_creacion || report.hora || ""
        let assignedInfoHTML = ""
        
        // Si la API nos da un nombre, lo mostramos
        if (report.mediador_nombre) {
            // Combinamos nombre y apellido
            const mediatorName = `${report.mediador_nombre} ${report.mediador_apellido || ''}`.trim()
            assignedInfoHTML = `
              <span class="report-mediator">
                  Atendido por: ${mediatorName}
              </span>
            `
        }

        // --- 3. Ensamblar HTML ---
        let reportHTML = `
          <div class="report-header">
              <span class="report-id">ID: ${report.id}</span>
              <span class="report-date-time">${report.fecha} ${horaCreacion}</span>
          </div>
          <div class="report-description">Ubicación: ${report.ubicacion}</div>
          
          <div class="report-status-wrapper">
            <div class="report-status">Estado: ${report.estado}</div>
            ${assignedInfoHTML} 
          </div>
        `
        // --- FIN DE MODIFICACIÓN ---

        // (Lógica de botones de la petición anterior, que funciona con tu nueva lógica)
        if (isPendingForm || isCompleted) {
            reportHTML += `
            <div class="report-actions">
                <button class="action-button form-button${isCompleted ? " completed" : ""}" data-id="${report.id}" ${isButtonDisabled ? "disabled" : ""}>
                    ${buttonLabel}
                </button>
            </div>
            `;
        } else {
             reportHTML += `
            <div class="report-actions">
                <button class="action-button form-button" data-id="${report.id}" ${isButtonDisabled ? "disabled" : ""}>
                    ${buttonLabel}
                </button>
            </div>
            `;
        }

        div.innerHTML = reportHTML
        reportsContainer.appendChild(div)
      })
    }

    // Actualizar listeners (lógica de la petición anterior)
    document.querySelectorAll(".form-button:not([disabled])").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const reportId = btn.dataset.id
        const reports = await (await authenticatedFetch(`${API_URL}/my-tasks/`)).json()
        const report = reports.find(r => r.id == reportId)
        if (!report) return;

        if (report.estado === "Pendiente Formulario") {
          openDetailedForm(reportId, report)
        } else if (report.estado === "Completado") {
          openCompletedForm(reportId, report)
        }
      })
    })
  } catch (error) {
    console.error("Error al cargar reportes:", error)
    reportsContainer.innerHTML = "<p>Error al cargar los reportes</p>"
  }
}

/**
 * Envía un reporte rápido con ubicación (MODIFICADO)
 */
async function submitReport(ubicacion) {
  try {
    // 💡 CAMBIO: 'descripcion' -> 'ubicacion'
    const submitData = {
      ubicacion: ubicacion.trim(),
    };

    const response = await authenticatedFetch(`${API_URL}/my-tasks/`, {
      method: "POST",
      body: JSON.stringify(submitData),
    });

    if (!response) return;
    await response.json();

    document.getElementById("exitoEnvio").textContent = "Reporte enviado con éxito";
    document.getElementById("reportForm").reset();
    loadReports();

    activeReportId = null;

    setTimeout(() => {
      hideModal("report-modal");
      document.getElementById("exitoEnvio").textContent = "";
      document.getElementById("errorUbicacion").textContent = "";
    }, 1000);
  } catch (error) {
    console.error("Error:", error);
    document.getElementById("errorUbicacion").textContent = `Error al enviar el reporte: ${error.message}`;
  }
}

// 💡 ELIMINADO: editReport (ya no se puede editar el reporte inicial)
// 💡 ELIMINADO: confirmCancelReport
// 💡 ELIMINADO: showCancelReasonModal
// 💡 ELIMINADO: cancelReportWithReason

/**
 * Abre el formulario detallado para un reporte pendiente (editable) (MODIFICADO)
 */
async function openDetailedForm(reportId, report) {
  activeReportId = reportId;

  // Resetear formulario y habilitarlo
  document.getElementById("detailed-form").reset();
  resetFormToEditable();
  enableFormSubmission();
  
  // Llenar datos (solo ubicación)
  fillFormWithReportData(report);
  
  showModal("detailed-form-modal");
}

/**
 * Abre el formulario detallado para un reporte completado (solo lectura) (MODIFICADO)
 */
async function openCompletedForm(reportId, report) {
  activeReportId = reportId;

  document.getElementById("detailed-form").reset();
  
  // Llenar datos (ubicación y descripción final)
  fillFormWithReportData(report);
  document.getElementById("descripcion-detallada").value = report.descripcion_final || "";

  // Hacer el formulario de solo lectura
  makeFormReadOnly();
  showModal("detailed-form-modal");
}

// 💡 ELIMINADO: loadExistingFormData (ya no hay tabla formularios)

/**
 * Llena el formulario con datos básicos del reporte (MODIFICADO)
 */
function fillFormWithReportData(report) {
  try {
    const formDescriptionElement = document.getElementById("form-description-text");
    if (formDescriptionElement) {
      // 💡 CAMBIO: 'descripcion' -> 'ubicacion'
      formDescriptionElement.textContent = report.ubicacion;
    }
  } catch (error) {
    console.error("Error al llenar datos del reporte:", error);
  }
}

/**
 * Envía el formulario detallado (solo descripción opcional) (MODIFICADO)
 */
async function submitDetailedForm() {
  try {
    if (!activeReportId) {
      alert("Error: No se ha seleccionado un reporte válido");
      return;
    }
    
    // 💡 CAMBIO: Ya no se validan campos, solo se toma la descripción
    const descripcionFinal = document.getElementById("descripcion-detallada").value.trim();

    const submitData = {
      descripcion_final: descripcionFinal,
    };

    // 💡 CAMBIO: Nuevo endpoint
    const response = await authenticatedFetch(`${API_URL}/my-tasks/${activeReportId}/completar`, {
      method: "POST",
      body: JSON.stringify(submitData),
    });

    if (!response) return;

    alert("Reporte completado con éxito");

    document.getElementById("detailed-form").reset();
    loadReports();

    activeReportId = null;
    
    setTimeout(() => {
      hideModal("detailed-form-modal");
    }, 1000);

  } catch (error)
 {
    console.error("Error:", error);
    alert("Error al completar el reporte: " + error.message);
  }
}


// --- FUNCIONES DE CONFIGURACIÓN DE EVENTOS (MODIFICADO) ---

function setupNavigationEvents() {
  // CAMBIO: Añadido listener para el botón de hamburguesa
  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    document.querySelector(".sidebar").classList.toggle("closed");
  });

  document.querySelectorAll(".nav-menu a").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const section = link.getAttribute("href").substring(1);
      document.querySelector(".section.active-section")?.classList.remove("active-section");
      document.getElementById(section).classList.add("active-section");

      document.querySelector(".nav-menu a.active")?.classList.remove("active");
      link.classList.add("active");

      activeSection = section;

      // CAMBIO: Añadido para cerrar el menú en móvil al hacer clic
      if (window.innerWidth <= 768) {
        document.querySelector(".sidebar").classList.add("closed");
      }
    });
  });

  document.getElementById("help-button").addEventListener("click", (e) => {
    e.preventDefault();
    showModal("help-modal");
  });

  document.querySelector(".close-help-modal").addEventListener("click", () => {
    hideModal("help-modal");
  });
}

function setupModalEvents() {
  document.getElementById("panic-button").addEventListener("click", () => {
    activeReportId = null;
    document.getElementById("reportForm").reset();
    showModal("report-modal");
  });

  document.querySelector(".close-modal").addEventListener("click", () => {
    hideModal("report-modal");
    activeReportId = null;
    document.getElementById("reportForm").reset();
  });

  document.querySelector(".close-detailed-modal").addEventListener("click", () => {
    hideModal("detailed-form-modal");
    activeReportId = null;
    document.getElementById("detailed-form").reset();
    resetFormToEditable();
    enableFormSubmission();
  });

  // 💡 ELIMINADO: Listeners de modales de cancelación

  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal")) {
      const modalId = e.target.id;
      hideModal(modalId);

      if (modalId === "report-modal" || modalId === "detailed-form-modal") {
        activeReportId = null;
        if (modalId === "report-modal") {
          document.getElementById("reportForm").reset();
        } else {
          document.getElementById("detailed-form").reset();
          resetFormToEditable();
          enableFormSubmission();
        }
      }
      // 💡 ELIMINADO: Limpieza de modal de cancelación
    }
  });
}

function setupFormEvents() {
  document.getElementById("reportForm").addEventListener("submit", (e) => {
    e.preventDefault();
    // 💡 CAMBIO: 'descripcion' -> 'ubicacion'
    const ubicacion = document.getElementById("ubicacion").value;
    if (!ubicacion.trim()) {
      document.getElementById("errorUbicacion").textContent = "La ubicación es obligatoria";
      return;
    }
    document.getElementById("errorUbicacion").textContent = "";
    submitReport(ubicacion);
  });

  document.getElementById("detailed-form").addEventListener("submit", (e) => {
    e.preventDefault();
    // 💡 CAMBIO: Ya no se validan campos, solo se llama a la función
    submitDetailedForm();
  });

  // El contactForm no existe en el HTML, pero lo dejamos por si se añade
  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const contactExito = document.getElementById("contactExito");
      if(contactExito) {
        contactExito.textContent = "Mensaje enviado con éxito";
      }
      e.target.reset();
      setTimeout(() => {
        if(contactExito) {
          contactExito.textContent = "";
        }
      }, 3000);
    });
  }


  // 💡 ELIMINADO: Form de 'cancel-reason-form'
}

function setupKeyboardEvents() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeActiveModal();
      return;
    }
    // 💡 ELIMINADO: Lógica de Enter para modales de cancelación
  });

  document.addEventListener("selectionchange", () => {
    const selection = document.getSelection();
    if (selection && selection.toString().length > 0) {
      autoUpdate = false;
    } else {
      autoUpdate = true;
    }
  });
}

function setupAccordion() {
  document.querySelectorAll(".accordion-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.classList.toggle("active");
      const content = header.nextElementSibling;
      content.style.maxHeight = content.style.MaxHeight ? null : content.scrollHeight + "px";
    });
  });
}


// --- FUNCIÓN DE INICIALIZACIÓN PRINCIPAL ---
document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("access_token");

  if (!token) {
    window.location.href = "index.html";
    return;
  }

  try {
    const response = await authenticatedFetch(`${API_URL}/me`);
    if (!response) return;

    const user = await response.json();
    currentUserRole = user.rol;
    
    // CAMBIO: Mostrar nombre y apellido en el header
    document.getElementById("username").textContent = `${user.nombre} ${user.apellido}`;
    
    // CAMBIO: Mostrar bienvenida con nombre (se mantiene de la petición anterior)
    document.getElementById("welcome-message").textContent = `¡BIENVENIDO, ${user.nombre.toUpperCase()}!`;

    const panicButton = document.getElementById("panic-button");
    if (user.caso_activo === 1) {
        panicButton.disabled = true;
        panicButton.title = "Ya tienes un caso activo. No puedes crear uno nuevo.";
    } else {
        panicButton.disabled = false;
        panicButton.title = "Presiona para reportar una emergencia";
    }

    loadReports();
  } catch (error) {
    console.error("Error al obtener información del usuario:", error);
    handleAuthError();
  }

  setupNavigationEvents();
  setupModalEvents();
  setupFormEvents();
  setupAccordion();
  setupKeyboardEvents();

  // CAMBIO: La línea que añadía la clase "closed" se ha eliminado
  // ya que ahora está en el HTML por defecto.
  // document.querySelector(".sidebar").classList.add("closed"); // <--- LÍNEA ELIMINADA
});

// --- FUNCIONES DE ACTUALIZACIÓN AUTOMÁTICA ---
setInterval(async () => {
  if (autoUpdate) {
    const isValid = await verifyTokenValidity();
    if (isValid) {
      loadReports();
    }
  }
}, 30000);

setInterval(() => {
  if (autoUpdate) {
    loadReports();
  }
}, 3000);