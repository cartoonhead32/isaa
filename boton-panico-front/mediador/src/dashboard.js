// =================================================================================
// ARCHIVO: dashboard.js (Actualizado con lógica de 'auto-asignación')
// =================================================================================
let API_URL;


  // Estamos en producción (Cloudflare Pages)
  API_URL = 'https://isaa-5m3t.onrender.com';
// --- VARIABLES DE ESTADO ---
let datosActuales = []
// 'mediadoresDisponibles' y 'activeReportId' ya no son necesarios para esto
let currentUser = null 
let pollingInterval = null 

// =================================================================================
// 1. INICIALIZACIÓN PRINCIPAL
// =================================================================================

document.addEventListener("DOMContentLoaded", async () => {
    // Referencias al DOM (solo elementos globales y persistentes)
    const logoutButton = document.getElementById("logout-button")
    const helpButton = document.getElementById("help-button")
    const closeHelpModal = document.querySelector(".close-help-modal")
    const helpModal = document.getElementById("help-modal")

    // Listeners globales
    if(logoutButton) logoutButton.addEventListener("click", logout)
    
    if (helpButton && closeHelpModal) {
        helpButton.addEventListener("click", (e) => {
            e.preventDefault();
            showModal("help-modal");
        });
        closeHelpModal.addEventListener("click", () => hideModal("help-modal"));
    }
    
    if (helpModal) {
        helpModal.addEventListener("click", (e) => {
            if (e.target === helpModal) hideModal("help-modal");
        });
    }

    // Arranca la lógica principal del panel
    await inicializarPanel();
})

/**
 * Función principal que decide qué panel mostrar al mediador.
 */
async function inicializarPanel() {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    // ... (Verifica el token, llama a /me, y decide qué panel mostrar)
    
    const token = localStorage.getItem("access_token")
    if (!token) {
        window.location.href = "index.html"
        return
    }

    try {
        const response = await authenticatedFetch(`${API_URL}/me`)
        if (!response) return

        currentUser = await response.json()
        
        if (currentUser.rol !== "mediador") { 
            alert("Acceso denegado. Solo mediadores pueden acceder a este panel.")
            window.location.href = "index.html" 
            return
        }
        
        document.getElementById("username").textContent = `${currentUser.nombre} ${currentUser.apellido}`
        
        if (currentUser.caso_activo === 1) {
            await mostrarCasoActivo();
        } else {
            await mostrarPanelDeCasos();
        }
        
    } catch (error) {
        console.error("Error al obtener información del usuario:", error)
        handleAuthError()
    }
}


// =================================================================================
// 2. LÓGICA DE VISTAS (QUÉ MOSTRAR)
// =================================================================================

/**
 * Muestra el panel con la TABLA de casos disponibles.
 */
async function mostrarPanelDeCasos() {
    console.log("Mediador libre. Mostrando tabla de casos.");
    
    document.getElementById("panel-tabla-casos").style.display = "block";
    document.getElementById("panel-caso-unico").style.display = "none";
    
    // --- LÓGICA SIMPLIFICADA ---
    // Ya no necesitamos listeners para 'asignarForm' o 'close-modal'
    
    const refreshButton = document.getElementById("refresh-button")
    if (refreshButton) {
        refreshButton.addEventListener("click", refrescarTabla)
    }

    // --- Cargar datos y empezar polling ---
    
    // ¡Ya no se llama a cargarMediadores!
    await cargarTabla(); // Carga inicial

    if (pollingInterval) clearInterval(pollingInterval); 
    
    pollingInterval = setInterval(async () => {
        // No verificamos 'modalAbierto' porque ya no hay modal de asignación
        console.log("Polling: Verificando nuevos casos...")
        await cargarTabla()
    }, 3000) 
}


/**
 * Muestra el panel con el CASO ÚNICO que el mediador está atendiendo.
 */
async function mostrarCasoActivo() {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    // ... (Oculta la tabla, muestra el panel, llama a /mediator/my-active-case)
    
    console.log("Mediador ocupado. Mostrando caso activo.");

    document.getElementById("panel-tabla-casos").style.display = "none";
    document.getElementById("panel-caso-unico").style.display = "block";

    if (pollingInterval) clearInterval(pollingInterval);

    try {
        const response = await authenticatedFetch(`${API_URL}/mediator/my-active-case`);
        if (!response) {
            throw new Error("No se pudo cargar el caso activo, aunque el estado es 'activo'.");
        }
        
        const task = await response.json();

        document.getElementById("caso-id").textContent = task.id;
        document.getElementById("caso-ubicacion").textContent = task.ubicacion;
        document.getElementById("caso-hora-creacion").textContent = `${task.fecha} ${task.hora_creacion}`;
        document.getElementById("caso-hora-asignacion").textContent = task.hora_asignacion ? `${task.fecha} ${task.hora_asignacion}` : 'N/A';
        document.getElementById("caso-estudiante-nombre").textContent = `${task.nombre_estudiante || ''} ${task.apellido_estudiante || ''}`.trim();
        document.getElementById("caso-estudiante-codigo").textContent = task.codigo_estudiante;
        document.getElementById("caso-estudiante-correo").textContent = task.correo_estudiante;

        const resolverButton = document.getElementById("btn-resolver-caso");
        resolverButton.dataset.taskId = task.id; 
        resolverButton.onclick = handleResolverCaso; 
        
    } catch (error) {
        console.error("Error al cargar caso activo:", error);
        if (error.message.includes("404")) {
             document.getElementById("errorCasoActivo").textContent = "Tienes un estado 'activo', pero no se encontró ninguna tarea 'Pendiente' asignada. Por favor, contacta a un administrador para liberar tu estado.";
        } else {
            document.getElementById("errorCasoActivo").textContent = `Error: ${error.message}. Recarga la página.`;
        }
    }
}

/**
 * Manejador para el evento click del botón "Resolver Caso".
 */
async function handleResolverCaso(event) {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    // ... (Llama a /tasks/{id}/resolver y recarga la página)
    
    const taskId = event.currentTarget.dataset.taskId;
    if (!taskId) {
        alert("Error: No se encontró el ID de la tarea.");
        return;
    }

    if (!confirm("¿Estás seguro de que has finalizado el apoyo y deseas marcar este caso como resuelto?")) {
        return;
    }

    try {
        const response = await authenticatedFetch(`${API_URL}/tasks/${taskId}/resolver`, {
            method: "PUT"
        });

        if (!response) {
            throw new Error("La solicitud al servidor falló.");
        }

        const result = await response.json();
        console.log("Caso resuelto:", result);
        
        alert("¡Éxito! Has marcado el caso como resuelto. El usuario ahora puede llenar el formulario final. Serás redirigido al panel principal.");
        
        window.location.reload(); 

    } catch (error) {
        console.error("Error al resolver el caso:", error);
        alert(`Error al intentar resolver el caso: ${error.message}`);
    }
}


// =================================================================================
// 3. FUNCIONES DE UTILIDAD (TU CÓDIGO ORIGINAL)
// =================================================================================

/**
 * Realiza peticiones HTTP autenticadas con token JWT
 */
async function authenticatedFetch(url, options = {}) {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    const token = localStorage.getItem("access_token")

    if (!token) {
        handleAuthError()
        return null
    }

    const userHeaders = options.headers ? { ...options.headers } : {}
    userHeaders["Authorization"] = `Bearer ${token}`

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
            let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                if (errorData.detail) {
                    errorDetail = errorData.detail;
                }
            } catch (e) {}
            throw new Error(errorDetail);
        }

        return response
    } catch (error) {
        console.error("Error en petición autenticada:", error)
        throw error
    }
}

/**
 * Maneja errores de autenticación limpiando datos y redirigiendo al login
 */
function handleAuthError() {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    localStorage.removeItem("access_token")
    alert("Tu sesión ha expirado. Serás redirigido al login.")
    window.location.href = "index.html"
}

function logout() {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
        localStorage.removeItem("access_token")
        alert("Sesión cerrada exitosamente")
        window.location.href = "index.html"
    }
}

function showModal(modalId) {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = "flex" 
        document.body.classList.add("modal-open")
    }
}

function hideModal(modalId) {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = "none"
        document.body.classList.remove("modal-open")
    }
}

function mostrarError(mensaje) {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    const errorFetchElement = document.getElementById("errorFetch");
    if (errorFetchElement) {
        errorFetchElement.textContent = mensaje;
        errorFetchElement.style.display = "block";
    }
}

function limpiarError() {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    const errorFetchElement = document.getElementById("errorFetch");
    if (errorFetchElement) {
        errorFetchElement.textContent = "";
        errorFetchElement.style.display = "none";
    }
}


// =================================================================================
// 4. FUNCIONES DE LA VISTA DE TABLA (SIMPLIFICADAS)
// =================================================================================

// --- ¡FUNCIÓN ELIMINADA! ---
// ya no necesitamos 'cargarMediadores()'

// --- ¡FUNCIÓN ELIMINADA! ---
// ya no necesitamos 'asignarMediador()'

/**
 * Construye la tabla solo con reportes ACTIVOS.
 */
async function cargarTabla() {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    if (document.getElementById("panel-tabla-casos").style.display === 'none') return;
    
    console.log("Cargando tabla de Casos Activos...")
    limpiarError()
    
    let url = `${API_URL}/search` 
    
    try {
        const response = await authenticatedFetch(url)
        if (!response) return

        const data = await response.json()
        
        console.log("Datos recibidos. Redibujando tabla.");
        datosActuales = data 
        mostrarJSONEnTabla(datosActuales) 
        
    } catch (error) {
        console.error("Error al cargar datos:", error)
        mostrarError("Error al cargar los reportes activos: " + error.message)
    }
}

/**
 * Genera la tabla HTML con el JSON de datos.
 * ¡Aquí está el cambio de lógica del botón!
 */
function mostrarJSONEnTabla(datos) {
    const tablaContenedor = document.getElementById("reportes-table")
    tablaContenedor.innerHTML = "" 

    if (!datos || datos.length === 0) {
        tablaContenedor.innerHTML = "<p id='buen-trabajo'>No hay reportes activos para asignar</p>"
        return
    }

    const tabla = document.createElement("table")
    tabla.className = "tabla-interna-reportes" // (Para corregir el estilo)

    const columnas = ["id", "fecha", "hora_creacion", "nombre_estudiante", "ubicacion", "dropdown_asignar"] 

    const thead = document.createElement("thead")
    const encabezadoFila = document.createElement("tr")

    columnas.forEach((columna) => {
        const th = document.createElement("th")
        if (columna === "dropdown_asignar") {
            th.textContent = "Acciones"
        } else if (columna === "nombre_estudiante") {
             th.textContent = "Estudiante"
        } else if (columna === "fecha") {
             th.textContent = "Fecha"
        } else if (columna === "hora_creacion") {
             th.textContent = "Hora"
        } else {
            th.textContent = columna.charAt(0).toUpperCase() + columna.slice(1)
        }
        encabezadoFila.appendChild(th)
    })
    thead.appendChild(encabezadoFila)
    tabla.appendChild(thead)

    const tbody = document.createElement("tbody")
    datos.forEach((filaData) => {
        const fila = document.createElement("tr")

        columnas.forEach((columna) => {
            const celda = document.createElement("td")
            
            if (columna === "dropdown_asignar") {
                // --- INICIO DE LA NUEVA LÓGICA DEL BOTÓN ---
                const btn = document.createElement("button")
                btn.className = "btn btn-primary action-dropdown-btn" 
                btn.textContent = "Asignar Apoyo" // El texto sigue igual
                
                // Añadimos el listener para la auto-asignación
                btn.addEventListener("click", () => {
                    // ¡Ya no abre un modal! Pregunta directamente.
                    if (confirm(`¿Estás seguro de que deseas tomar el caso ID ${filaData.id}?\n\nUbicación: ${filaData.ubicacion}`)) {
                        // Llama a la nueva función de auto-asignación
                        selfAssignTask(filaData.id);
                    }
                })
                celda.appendChild(btn)
                // --- FIN DE LA NUEVA LÓGICA DEL BOTÓN ---
                
            } else if (columna === "nombre_estudiante") {
                celda.textContent = `${filaData.nombre_estudiante || ''} ${filaData.apellido_estudiante || ''}`.trim()
            } else {
                celda.textContent = filaData[columna] || '-'
            }
            fila.appendChild(celda)
        })
        tbody.appendChild(fila)
    })

    tabla.appendChild(tbody)
    tablaContenedor.appendChild(tabla)
}

/**
 * ¡NUEVA FUNCIÓN!
 * Llama a la API para auto-asignarse una tarea.
 * Es llamada por el botón en la tabla.
 */
async function selfAssignTask(taskId) {
    try {
        // Hacemos 'PUT' a /asignar. Ya no enviamos body.
        const response = await authenticatedFetch(`${API_URL}/tasks/${taskId}/asignar`, {
            method: "PUT",
        })

        if (!response) return // El error ya fue manejado por authenticatedFetch

        await response.json()
        alert(`¡Caso ID ${taskId} asignado a ti! Se recargará tu panel.`);
        
        // Recargamos la página. Al recargar, inicializarPanel()
        // verá que 'caso_activo' es 1 y mostrará la vista de caso único.
        window.location.reload();

    } catch (error) {
        console.error("Error al auto-asignar tarea:", error)
        alert(`Error al tomar el caso: ${error.message}. Es posible que alguien más lo haya tomado. Refrescando...`)
        refrescarTabla(); // Recarga la tabla por si el error fue que el caso ya no estaba
    }
}

/**
 * Forzar la recarga de la tabla limpiando la caché de datos.
 */
function refrescarTabla() {
    // ... (Esta función es IDÉNTICA a la versión anterior)
    datosActuales = [] 
    cargarTabla()
}