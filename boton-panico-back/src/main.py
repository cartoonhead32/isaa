from typing import List, Optional, Dict, Any, Union, Annotated
from contextlib import contextmanager
from fastapi import FastAPI, HTTPException, Query, Depends, status, Response, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, validator, Field, EmailStr
import sqlite3
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta
import zoneinfo
import jwt
from passlib.context import CryptContext
import logging
from enum import Enum
import json
import uvicorn
import zoneinfo

# CONFIGURACIÓN INICIAL Y CONSTANTES
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
DATABASE_URL = os.getenv("DATABASE_URL", "db/isaa.db")

if not SECRET_KEY:
    raise ValueError("SECRET_KEY no configurada en .env")

# CONFIGURACIÓN DE SEGURIDAD
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- ENUMERACIONES Y TIPOS DE DATOS ---
class EstadoTarea(str, Enum):
    ACTIVO = "Activo"
    PENDIENTE = "Pendiente"
    PENDIENTE_FORMULARIO = "Pendiente Formulario"  # <-- Añadir esta línea
    COMPLETADO = "Completado"

# --- MODELOS PYDANTIC PARA VALIDACIÓN DE DATOS ---
class Usuario(BaseModel):
    id: Optional[int] = None
    codigo: str
    correo: str
    contrasena: Optional[str] = None
    rol: str = "usuario"
    nombre: Optional[str] = None 
    apellido: Optional[str] = None 
    caso_activo: int = 0  # <-- Añadir esta línea
    
    @validator('codigo')
    def codigo_no_vacio(cls, v):
        if not v or not v.strip():
            raise ValueError('El código no puede estar vacío')
        return v.strip()
    
    @validator('correo')
    def correo_valido(cls, v):
        if not v or not v.strip():
            raise ValueError('El formato del correo no es válido')
        return v.strip().lower()

class UsuarioResponse(BaseModel):
    id: int
    codigo: str
    correo: str
    rol: str
    nombre: Optional[str] = None 
    apellido: Optional[str] = None 
    caso_activo: int  # <-- Añadir esta línea

class Task(BaseModel):
    id: Optional[int] = None
    usuario_id: Optional[int] = None
    ubicacion: Optional[str] = Field(None, min_length=1)
    estado: Optional[EstadoTarea] = EstadoTarea.ACTIVO
    fecha: Optional[str] = None 
    hora_creacion: Optional[str] = None  # <-- Renombrar 'hora'
    hora_asignacion: Optional[str] = None 
    hora_resolucion: Optional[str] = None # <-- Añadir esta línea
    hora_completado: Optional[str] = None 
    mediador_id: Optional[int] = None 
    descripcion_final: Optional[str] = None
    
    @validator('ubicacion')
    def ubicacion_no_vacia(cls, v):
        if v is not None and not v.strip():
            raise ValueError('La ubicación no puede estar vacía')
        return v.strip() if v else None

class TaskResponse(BaseModel):
    id: Optional[int] = None
    usuario_id: Optional[int] = None
    codigo_estudiante: Optional[str] = None
    correo_estudiante: Optional[str] = None
    nombre_estudiante: Optional[str] = None 
    apellido_estudiante: Optional[str] = None 
    ubicacion: Optional[str] = None 
    estado: Optional[str] = EstadoTarea.ACTIVO
    fecha: Optional[str] = None 
    hora_creacion: Optional[str] = None  # <-- Renombrar 'hora'
    hora_asignacion: Optional[str] = None 
    hora_resolucion: Optional[str] = None # <-- Añadir esta línea
    hora_completado: Optional[str] = None 
    mediador_id: Optional[int] = None 
    descripcion_final: Optional[str] = None 
    mediador_nombre: Optional[str] = None
    mediador_apellido: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    codigo: Optional[str] = None

class CompletarRequest(BaseModel):
    descripcion_final: Optional[str] = ""

class AsignarRequest(BaseModel):
    mediador_id: int

class HealthCheck(BaseModel):
    status: str = "OK" 

# --- FUNCIONES DE UTILIDAD Y HELPERS ---

@contextmanager
def get_db_connection():
    conn = None
    try:
        conn = sqlite3.connect(DATABASE_URL)
        conn.row_factory = sqlite3.Row
        yield conn
    except sqlite3.Error as e:
        logger.error(f"Error de base de datos: {e}")
        if conn:
            conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error de conexión a la base de datos"
        )
    finally:
        if conn:
            conn.close()

def get_current_local_date_time():
    try:
        tz = zoneinfo.ZoneInfo("America/Mexico_City")
        now = datetime.now(tz)
        fecha = now.strftime("%d/%m/%Y")
        hora = now.strftime("%H:%M")
        return fecha, hora
    except Exception as e:
        logger.warning(f"Error al obtener fecha con ZoneInfo (fallback a UTC-6): {e}")
        mexico_time = datetime.utcnow() - timedelta(hours=6)
        fecha = mexico_time.strftime("%d/%m/%Y")
        hora = mexico_time.strftime("%H:%M")
        return fecha, hora

# --- FUNCIONES DE AUTENTICACIÓN Y SEGURIDAD ---

def verify_password(plain_password, hashed_password):
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def get_password_hash(password):
    return pwd_context.hash(password)

def get_user(codigo: str):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM usuarios WHERE codigo = ?", (codigo,))
            user = cursor.fetchone()
            return dict(user) if user else None
    except Exception as e:
        logger.error(f"Error al obtener usuario: {e}")
        return None

def authenticate_user(codigo: str, password: str):
    user = get_user(codigo)
    if not user:
        return False
    if not verify_password(password, user["contrasena"]):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    try:
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    except Exception as e:
        logger.error(f"Error creando token: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al crear token de acceso"
        )

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        codigo: str = payload.get("sub")
        if codigo is None:
            raise credentials_exception
        token_data = TokenData(codigo=codigo)
    except jwt.PyJWTError as e:
        logger.error(f"Error decodificando token: {e}")
        raise credentials_exception
    
    user = get_user(codigo=token_data.codigo)
    if user is None:
        raise credentials_exception
    return user

def get_current_mediador(current_user: dict = Depends(get_current_user)):
    if current_user.get("rol") != "mediador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso restringido a mediadores"
        )
    return current_user

def get_task_details(db_conn: sqlite3.Connection, task_id: int) -> Optional[dict]:
    """
    Helper function to retrieve detailed task information, including user and mediator details.
    """
    query = """
        SELECT 
            t.id, t.usuario_id, 
            u.codigo as codigo_estudiante, u.correo as correo_estudiante,
            u.nombre as nombre_estudiante, u.apellido as apellido_estudiante,
            t.ubicacion, t.estado, t.fecha, t.hora_creacion, 
            t.hora_asignacion, t.hora_resolucion, t.hora_completado,
            t.mediador_id, t.descripcion_final,
            m.correo as mediador_correo
        FROM tasks t
        JOIN usuarios u ON t.usuario_id = u.id
        LEFT JOIN usuarios m ON t.mediador_id = m.id
        WHERE t.id = ?
    """
    cursor = db_conn.cursor()
    cursor.execute(query, (task_id,))
    task_data = cursor.fetchone()
    
    if task_data:
        return dict(task_data)
    return None

# --- INICIALIZACIÓN DE BASE DE DATOS (MODIFICADA) ---
def init_db():
    try:
        os.makedirs("db", exist_ok=True)
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Tabla de usuarios
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'")
            users_table_exists = cursor.fetchone()
            if not users_table_exists:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS usuarios (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        rol TEXT DEFAULT 'usuario',
                        codigo TEXT UNIQUE NOT NULL,
                        correo TEXT NOT NULL,
                        contrasena TEXT NOT NULL,
                        nombre TEXT, 
                        apellido TEXT,
                        caso_activo INTEGER NOT NULL DEFAULT 0
                    )
                """)
                logger.info("Tabla 'usuarios' creada")
            else:
                # Migración: Añadir nombre y apellido si no existen
                cursor.execute("PRAGMA table_info(usuarios)")
                columns = [column[1] for column in cursor.fetchall()]
                if 'nombre' not in columns:
                    cursor.execute("ALTER TABLE usuarios ADD COLUMN nombre TEXT")
                    logger.info("Columna 'nombre' agregada a usuarios")
                if 'apellido' not in columns:
                    cursor.execute("ALTER TABLE usuarios ADD COLUMN apellido TEXT")
                    logger.info("Columna 'apellido' agregada a usuarios")

            # --- Bloque de Reseteo y Creación de Usuarios (CON NOMBRES) ---
            common_pass_hash = get_password_hash("a") 

            # 2. Mediador 1 (Apoyo)
            cursor.execute(
                '''
                INSERT OR REPLACE INTO usuarios (id, rol, codigo, correo, contrasena, nombre, apellido) 
                VALUES (
                    (SELECT id FROM usuarios WHERE codigo = 'mediador1'),
                    'mediador', 'mediador1', 'mediador1@isaa.com', ?, 'Mediador', 'Saul'
                )
                ''',
                (common_pass_hash,)
            )
            logger.info("Usuario 'mediador1' restablecido.")
            
            # 3. Mediador 2 (Otro Apoyo para probar el dropdown)
            cursor.execute(
                '''
                INSERT OR REPLACE INTO usuarios (id, rol, codigo, correo, contrasena, nombre, apellido) 
                VALUES (
                    (SELECT id FROM usuarios WHERE codigo = 'mediador2'),
                    'mediador', 'mediador2', 'mediador2@isaa.com', ?, 'Mediador', 'Juan'
                )
                ''',
                (common_pass_hash,)
            )
            logger.info("Usuario 'mediador2' (nuevo) creado.")

            # 4. Usuario Estudiante
            cursor.execute(
                '''
                INSERT OR REPLACE INTO usuarios (id, rol, codigo, correo, contrasena, nombre, apellido) 
                VALUES (
                    (SELECT id FROM usuarios WHERE codigo = '222000000'),
                    'usuario', '222000000', 'alberich@alumno.com', ?, 'Alberich', 'Leal'
                )
                ''',
                (common_pass_hash,)
            )
            logger.info("Usuario 'estudiante' restablecido.")
            
            # 5. Admin (Futuro, sin uso actual)
            cursor.execute(
                '''
                INSERT OR REPLACE INTO usuarios (id, rol, codigo, correo, contrasena, nombre, apellido) 
                VALUES (
                    (SELECT id FROM usuarios WHERE codigo = 'admin'),
                    'admin', 'admin', 'admin@isaa.com', ?, 'Admin', 'ISAA'
                )
                ''',
                (common_pass_hash,)
            )
            logger.info("Usuario 'admin' (futuro) (re)establecido.")
            
            # --- FIN DEL BLOQUE DE RESISTENCIA ---

            # Tabla de tareas/reportes (MODIFICADA)
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'")
            tasks_table_exists = cursor.fetchone()

            if not tasks_table_exists:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS tasks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        usuario_id INTEGER NOT NULL,
                        ubicacion TEXT NOT NULL,
                        estado TEXT NOT NULL,
                        fecha TEXT NOT NULL,
                        hora_creacion TEXT NOT NULL, -- Renombrada desde 'hora'
                        hora_asignacion TEXT,
                        hora_resolucion TEXT,        -- ¡NUEVA COLUMNA!
                        hora_completado TEXT,
                        mediador_id INTEGER,
                        descripcion_final TEXT,
                        FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
                        FOREIGN KEY (mediador_id) REFERENCES usuarios (id)
                    );
                """)
                logger.info("Tabla 'tasks' creada con el nuevo esquema")
            else:
                # Script de migración (Añadir columnas si no existen)
                cursor.execute("PRAGMA table_info(tasks)")
                columns = [column[1] for column in cursor.fetchall()]
                
                if 'ubicacion' not in columns:
                    cursor.execute("ALTER TABLE tasks ADD COLUMN ubicacion TEXT")
                if 'hora_asignacion' not in columns:
                    cursor.execute("ALTER TABLE tasks ADD COLUMN hora_asignacion TEXT")
                if 'hora_completado' not in columns:
                    cursor.execute("ALTER TABLE tasks ADD COLUMN hora_completado TEXT")
                if 'mediador_id' not in columns:
                    cursor.execute("ALTER TABLE tasks ADD COLUMN mediador_id INTEGER REFERENCES usuarios(id)")
                if 'descripcion_final' not in columns:
                    cursor.execute("ALTER TABLE tasks ADD COLUMN descripcion_final TEXT")

            # Crear índices para optimizar rendimiento
            indices = [
                ("idx_tasks_usuario_id", "CREATE INDEX IF NOT EXISTS idx_tasks_usuario_id ON tasks(usuario_id)"),
                ("idx_usuarios_codigo", "CREATE INDEX IF NOT EXISTS idx_usuarios_codigo ON usuarios(codigo)"),
                ("idx_usuarios_correo", "CREATE INDEX IF NOT EXISTS idx_usuarios_correo ON usuarios(correo)"),
                ("idx_tasks_mediador_id", "CREATE INDEX IF NOT EXISTS idx_tasks_mediador_id ON tasks(mediador_id)"),
                ("idx_tasks_estado", "CREATE INDEX IF NOT EXISTS idx_tasks_estado ON tasks(estado)")
            ]
            
            for index_name, create_sql in indices:
                cursor.execute(f"SELECT name FROM sqlite_master WHERE type='index' AND name='{index_name}'")
                if not cursor.fetchone():
                    cursor.execute(create_sql)
            
            conn.commit()
            logger.info("Base de datos inicializada correctamente")
    except Exception as e:
        logger.error(f"Error al inicializar la base de datos: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al inicializar la base de datos"
        )

# --- INICIALIZACIÓN DE FASTAPI ---
app = FastAPI(title="ISAA API - Task Manager", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    try:
        init_db()
    except Exception as e:
        logger.critical(f"Error crítico al iniciar la aplicación: {e}")

# --- ENDPOINTS DE AUTENTICACIÓN ---=
@app.post("/usuarios/", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
async def create_user(user: Usuario):
    """
    Crea un nuevo usuario en la base de datos.
    Espera un JSON con: codigo, correo, contrasena, nombre, apellido.
    El rol se asigna por defecto como 'usuario'.
    """
    # Hashear la contraseña antes de guardarla
    hashed_password = get_password_hash(user.contrasena)
    
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO usuarios (codigo, correo, contrasena, rol, nombre, apellido, caso_activo)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,  # <-- CAMBIO: Añadido caso_activo
                (user.codigo, user.correo, hashed_password, 'usuario', user.nombre, user.apellido, 0)  # <-- CAMBIO: Añadido valor 0
            )
            conn.commit()
            
            # Obtener el ID del usuario recién creado
            new_user_id = cursor.lastrowid
            
            # Devolver los datos del usuario creado (sin la contraseña)
            return UsuarioResponse(
                id=new_user_id,
                codigo=user.codigo,
                correo=user.correo,
                rol='usuario',
                nombre=user.nombre,
                apellido=user.apellido,
                caso_activo=0
            )

    except sqlite3.IntegrityError as e:
        # Esto maneja el caso de que el 'codigo' (o 'correo') ya exista
        if "UNIQUE constraint failed: usuarios.codigo" in str(e):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El código de usuario ya está registrado."
            )
        elif "UNIQUE constraint failed: usuarios.correo" in str(e):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El correo electrónico ya está registrado."
            )
        logger.error(f"Error de integridad de base de datos: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error en los datos proporcionados. Es posible que el código o correo ya existan."
        )
    except Exception as e:
        logger.error(f"Error al crear usuario: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno del servidor al crear el usuario."
        )
    
# --- ENDPOINTS DE AUTENTICACIÓN ---
@app.post("/token", response_model=Token)
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends()
):
    try:
        user = authenticate_user(form_data.username, form_data.password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuario o contraseña incorrectos",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["codigo"], "rol": user["rol"]},
            expires_delta=access_token_expires
        )
        response.headers["Cache-Control"] = "no-store"
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error inesperado en login: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno del servidor al procesar la solicitud de login"
        )

@app.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "codigo": current_user["codigo"],
        "correo": current_user["correo"],
        "rol": current_user["rol"],
        "nombre": current_user.get("nombre"),
        "apellido": current_user.get("apellido"),
        "caso_activo": current_user.get("caso_activo") # <-- AÑADIR ESTA LÍNEA
    }

@app.get("/my-tasks/", response_model=List[TaskResponse])
async def read_my_tasks(
    estado: Optional[EstadoTarea] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    """Obtiene las tareas del usuario actual."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # --- INICIO DE LA MODIFICACIÓN ---
            # Unimos (LEFT JOIN) la tabla de usuarios por segunda vez (como 'm')
            # para obtener el nombre y apellido del mediador.
            query = """
                SELECT t.id, t.usuario_id, 
                       u.codigo as codigo_estudiante, u.correo as correo_estudiante, 
                       u.nombre as nombre_estudiante, u.apellido as apellido_estudiante,
                       t.ubicacion, t.estado, t.fecha, 
                       t.hora_creacion, -- (o 't.hora' si no lo has renombrado)
                       t.hora_asignacion, t.hora_resolucion, t.hora_completado,
                       t.mediador_id, t.descripcion_final,
                       m.nombre as mediador_nombre,    -- <-- LÍNEA AÑADIDA
                       m.apellido as mediador_apellido -- <-- LÍNEA AÑADIDA
                FROM tasks t
                JOIN usuarios u ON t.usuario_id = u.id
                LEFT JOIN usuarios m ON t.mediador_id = m.id -- <-- LÍNEA AÑADIDA
                WHERE t.usuario_id = ?
            """
            # --- FIN DE LA MODIFICACIÓN ---

            params = [current_user["id"]]
            
            if estado:
                query += " AND t.estado = ?"
                params.append(estado.value)
            
            query += " ORDER BY t.fecha DESC, t.hora_creacion DESC LIMIT ? OFFSET ?" # (Ajusta 'hora_creacion' si es necesario)
            params.extend([limit, offset])
            
            cursor.execute(query, tuple(params))
            tasks = cursor.fetchall()
            return [TaskResponse(**dict(task)) for task in tasks]
    except Exception as e:
        logger.error(f"Error al obtener tareas del usuario: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al recuperar las tareas del usuario"
        )

@app.get("/tasks/{task_id}", response_model=TaskResponse)
async def read_task(task_id: int, current_user: dict = Depends(get_current_mediador)):
    try:
        with get_db_connection() as conn:
            task_data = get_task_details(conn, task_id)
            
            if task_data is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, 
                    detail="Tarea no encontrada"
                )
            return TaskResponse(**task_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al obtener tarea {task_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al recuperar la tarea"
        )

@app.get("/my-tasks/", response_model=List[TaskResponse])
async def read_my_tasks(
    estado: Optional[EstadoTarea] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user)
):
    """Obtiene las tareas del usuario actual."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            query = """
                SELECT t.id, t.usuario_id, u.codigo as codigo_estudiante, u.correo as correo_estudiante, 
                       u.nombre as nombre_estudiante, u.apellido as apellido_estudiante,
                       t.ubicacion, t.estado, t.fecha, 
                       t.hora_creacion,
                       t.hora_asignacion, t.hora_completado,
                       t.mediador_id, t.descripcion_final,
                       m.correo as mediador_correo
                FROM tasks t
                JOIN usuarios u ON t.usuario_id = u.id
                LEFT JOIN usuarios m ON t.mediador_id = m.id
                WHERE t.usuario_id = ?
            """
            params = [current_user["id"]]
            
            if estado:
                query += " AND t.estado = ?"
                params.append(estado.value)
            
            query += " ORDER BY t.fecha DESC, t.hora_creacion DESC LIMIT ? OFFSET ?" # <-- MODIFICADO
            params.extend([limit, offset])
            
            cursor.execute(query, params)
            tasks = cursor.fetchall()
            return [TaskResponse(**dict(task)) for task in tasks]
    except Exception as e:
        logger.error(f"Error al obtener tareas del usuario: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al recuperar las tareas del usuario"
        )

@app.get("/mediadores/", response_model=List[UsuarioResponse])
async def get_mediadores(current_user: dict = Depends(get_current_mediador)):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, codigo, correo, rol, nombre, apellido, caso_activo FROM usuarios WHERE rol = 'mediador'"
            )
            mediadores = cursor.fetchall()
            return [UsuarioResponse(**dict(m)) for m in mediadores]
    except Exception as e:
        logger.error(f"Error al obtener mediadores: {e}")
        raise HTTPException(status_code=500, detail="Error al obtener lista de mediadores")

@app.get("/search", response_model=List[TaskResponse])
async def search_active_tasks(
  limit: int = Query(100, ge=1, le=500),
  offset: int = Query(0, ge=0),
  current_user: dict = Depends(get_current_mediador)
):
    try:
        base_query = """
            SELECT t.id, t.usuario_id, u.codigo as codigo_estudiante, u.correo as correo_estudiante, 
                   u.nombre as nombre_estudiante, u.apellido as apellido_estudiante,
                   t.ubicacion, t.estado, t.fecha, 
                   t.hora_creacion, -- <-- MODIFICADO
                   t.hora_asignacion, 
                   t.hora_resolucion, -- <-- AÑADIDO
                   t.hora_completado,
                   t.mediador_id, t.descripcion_final,
                   m.correo as mediador_correo
            FROM tasks t
            JOIN usuarios u ON t.usuario_id = u.id
            LEFT JOIN usuarios m ON t.mediador_id = m.id
            WHERE t.estado = ?
        """
        valores = [EstadoTarea.ACTIVO.value]
        
        # FIFO: Más antiguo primero
        query = base_query + " ORDER BY t.id ASC LIMIT ? OFFSET ?" 
        valores.extend([limit, offset])
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, valores)
            rows = cursor.fetchall()
            return [TaskResponse(**dict(row)) for row in rows]
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en búsqueda de activos: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al procesar la búsqueda de casos activos"
        )

# --- ENDPOINTS DE ESCRITURA Y ACTUALIZACIÓN ---

@app.post("/my-tasks/", response_model=TaskResponse, status_code=201)
async def create_my_task(task: Task, current_user: dict = Depends(get_current_user)):
    """Crea una nueva tarea para el usuario actual."""
    try:

        if current_user.get("caso_activo", 0) == 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ya tienes un caso activo. No puedes crear uno nuevo hasta que se resuelva."
            )

        if not task.ubicacion:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La ubicación es obligatoria"
            )
        
        fecha, hora = get_current_local_date_time()
        usuario_id = current_user["id"]
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO tasks (usuario_id, ubicacion, estado, fecha, hora_creacion) VALUES (?, ?, ?, ?, ?)",
                (usuario_id, task.ubicacion, EstadoTarea.ACTIVO, fecha, hora)
            )
            task_id = cursor.lastrowid
            cursor.execute(
                "UPDATE usuarios SET caso_activo = 1 WHERE id = ?",
                (usuario_id,)
            )
            conn.commit()
            
            # 💡 LLAMADA CORREGIDA: Llama a la función de lectura que ya está definida
            task_data = get_task_details(conn, task_id)
            
            if not task_data:
                 raise HTTPException(status_code=500, detail="Error al crear la tarea.")

            return TaskResponse(**task_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al crear tarea del usuario {current_user['id']}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al crear la tarea"
        )

@app.post("/my-tasks/{task_id}/completar", response_model=TaskResponse)
async def complete_task(
    task_id: int,
    request: CompletarRequest,
    current_user: dict = Depends(get_current_user)
):
    """Permite al usuario 'completar' un reporte (estado Pendiente -> Completado)."""
    try:
        fecha, hora_completado = get_current_local_date_time()
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute(
                "SELECT id FROM tasks WHERE id = ? AND usuario_id = ? AND estado = ?",
                (task_id, current_user["id"], EstadoTarea.PENDIENTE_FORMULARIO)
            )
            task = cursor.fetchone()
            
            if not task:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No se encontró un reporte pendiente para completar"
                )
            
            cursor.execute(
                "UPDATE tasks SET estado = ?, hora_completado = ?, descripcion_final = ? WHERE id = ?",
                (EstadoTarea.COMPLETADO, hora_completado, request.descripcion_final, task_id)
            )
            conn.commit()
            
            task_data = get_task_details(conn, task_id)
            if not task_data:
                raise HTTPException(status_code=404, detail="Error al recuperar la tarea actualizada.")
                
            return TaskResponse(**task_data)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al completar tarea {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Error al completar la tarea")

# --- REEMPLAZA TU FUNCIÓN 'assign_task' EXISTENTE POR ESTA ---

@app.put("/tasks/{task_id}/asignar", response_model=TaskResponse)
async def assign_task_to_self(  # (He cambiado el nombre de la función para más claridad)
    task_id: int,
    current_user: dict = Depends(get_current_mediador) # <-- ¡Ya no se recibe 'request: AsignarRequest'!
):
    """
    (Mediador) Se auto-asigna una tarea.
    La tarea debe estar en estado 'Activo'.
    El mediador debe estar en estado 'caso_activo = 0'.
    """
    
    # Verificar si el mediador ya tiene un caso activo
    if current_user.get("caso_activo", 0) == 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya tienes un caso asignado. Resuelve tu caso actual primero."
        )
    
    try:
        fecha, hora_asignacion = get_current_local_date_time()
        
        # Obtenemos el ID del mediador directamente del token
        mediador_id_asignado = current_user["id"]
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # 1. Verificar que la tarea esté 'Activa'
            cursor.execute("SELECT id, usuario_id FROM tasks WHERE id = ? AND estado = ?", (task_id, EstadoTarea.ACTIVO))
            task = cursor.fetchone()
            
            if not task:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No se encontró un reporte activo con ese ID. Es posible que otro mediador ya lo haya tomado."
                )
            
            # 2. Asignar la tarea
            cursor.execute(
                "UPDATE tasks SET estado = ?, mediador_id = ?, hora_asignacion = ? WHERE id = ?",
                (EstadoTarea.PENDIENTE, mediador_id_asignado, hora_asignacion, task_id)
            )
            
            # 3. Marcar al mediador como ocupado
            cursor.execute(
                "UPDATE usuarios SET caso_activo = 1 WHERE id = ?",
                (mediador_id_asignado,)
            )
            
            conn.commit()
            
            # Devolver la tarea actualizada usando nuestra función helper
            task_data = get_task_details(conn, task_id)
            if not task_data:
                raise HTTPException(status_code=404, detail="Error al recuperar la tarea actualizada.")
            
            return TaskResponse(**task_data)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al auto-asignar tarea {task_id} a mediador {current_user['id']}: {e}")
        raise HTTPException(status_code=500, detail="Error al asignar la tarea")

@app.put("/tasks/{task_id}/resolver", response_model=TaskResponse)
async def resolve_task(
    task_id: int,
    current_user: dict = Depends(get_current_mediador)
):
    """
    (Mediador) Marca una tarea como resuelta.
    Cambia el estado de 'Pendiente' a 'Pendiente Formulario'.
    Registra la 'hora_resolucion'.
    Libera el estado 'caso_activo' tanto del mediador como del usuario.
    """
    try:
        fecha, hora_resolucion = get_current_local_date_time()
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Verificar que la tarea existe, está 'Pendiente' y pertenece a este mediador
            cursor.execute(
                "SELECT id, usuario_id FROM tasks WHERE id = ? AND mediador_id = ? AND estado = ?",
                (task_id, current_user["id"], EstadoTarea.PENDIENTE)
            )
            task = cursor.fetchone()
            
            if not task:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No se encontró una tarea pendiente asignada a usted con ese ID."
                )
            
            usuario_id = task["usuario_id"]

            # Actualizar la tarea
            cursor.execute(
                "UPDATE tasks SET estado = ?, hora_resolucion = ? WHERE id = ?",
                (EstadoTarea.PENDIENTE_FORMULARIO, hora_resolucion, task_id)
            )
            
            # Liberar al mediador
            cursor.execute(
                "UPDATE usuarios SET caso_activo = 0 WHERE id = ?",
                (current_user["id"],)
            )
            
            # Liberar al usuario
            cursor.execute(
                "UPDATE usuarios SET caso_activo = 0 WHERE id = ?",
                (usuario_id,)
            )
            
            conn.commit()
            
            # Devolver la tarea actualizada
            task_data = get_task_details(conn, task_id)
            if not task_data:
                raise HTTPException(status_code=404, detail="Error al recuperar la tarea actualizada.")
                
            return TaskResponse(**task_data)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al resolver tarea {task_id}: {e}")
        raise HTTPException(status_code=500, detail="Error al resolver la tarea")

@app.get("/mediator/my-active-case", response_model=TaskResponse)
async def get_my_active_case_mediator(
    current_user: dict = Depends(get_current_mediador)
):
    """
    Obtiene el caso activo (estado 'Pendiente') asignado al mediador actual.
    
    Si el mediador tiene caso_activo = 1, DEBE haber una tarea 
    en estado 'Pendiente' asignada a él.
    """
    
    # Verificamos si el flag del usuario es 1.
    # Si es 0, no tiene sentido buscar y podemos ahorrar una consulta.
    if current_user.get("caso_activo", 0) == 0:
        # No tiene un caso activo, podemos devolver null o un error.
        # Devolver 404 es semánticamente correcto.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="No tiene ningún caso activo asignado."
        )

    try:
        with get_db_connection() as conn:
            # Buscamos la tarea que está en "Pendiente" y asignada a este mediador.
            # Esta es, por definición, su tarea activa.
            cursor = conn.cursor()
            query = """
                SELECT t.id
                FROM tasks t
                WHERE t.mediador_id = ? AND t.estado = ?
            """
            cursor.execute(query, (current_user["id"], EstadoTarea.PENDIENTE))
            task_row = cursor.fetchone()

            if not task_row:
                # Esto es un estado inconsistente (flag=1 pero sin tarea).
                # Podríamos forzar la corrección del flag aquí, pero por ahora...
                logger.warning(f"Inconsistencia: Mediador {current_user['id']} tiene caso_activo=1 pero no se encontró tarea 'Pendiente'.")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, 
                    detail="No se encontró un caso 'Pendiente' activo."
                )
            
            # Usamos la función helper que ya creamos para obtener todos los detalles
            task_details = get_task_details(conn, task_row["id"])

            if not task_details:
                # Esto no debería pasar si la línea anterior tuvo éxito
                raise HTTPException(status_code=404, detail="Error al recuperar detalles del caso.")

            return TaskResponse(**task_details)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al obtener caso activo para mediador {current_user['id']}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al recuperar el caso activo."
        )


@app.get(
    "/health",
    tags=["healthcheck"],
    summary="Perform a Health Check",
    response_description="Return HTTP Status Code 200 (OK)",
    status_code=status.HTTP_200_OK,
    response_model=HealthCheck,
)
def get_health() -> HealthCheck:
    """
    ## Perform a Health Check
    Endpoint to perform a healthcheck on. This endpoint can primarily be used Docker
    to ensure a robust container orchestration and management is in place. Other
    services which rely on proper functioning of the API service will not deploy if this
    endpoint returns any other HTTP status code except 200 (OK).
    Returns:
        HealthCheck: Returns a JSON response with the health status
    """
    return HealthCheck(status="OK")
# --- ENDPOINTS DE GESTIÓN DE USUARIOS (Se omiten create/read por brevedad) ---
# ... (Si necesitas crear/leer usuarios, esos endpoints se pueden añadir aquí) ...


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
