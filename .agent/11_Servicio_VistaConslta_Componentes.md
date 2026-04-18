# Interfaz de la vista

## Interfaz vista general
Aquí tienes la representación en formato wireframe ASCII de la imagen proporcionada. He utilizado el sistema de números y leyenda que sugeriste para mantener el esquema limpio y fácil de procesar para cualquier agente o modelo de lenguaje.

```text
+-----------------------------------------+-------------------------------------------------+
|                                         |                                                 |
|  +-----------------------------------+  |  [5]            [6]  |  [8]            [9]      |
|  |                [1]                |  |                      |                          |
|  +-----------------------------------+  |                      |                          |
|                                         |                      |                          |
|  +-----------------------------------+  |                      |                          |
|  |                [2]                |  |                      |                          |
|  +-----------------------------------+  |         [7]          |           [10]           |
|                                         |                      |                          |
|  +-----------------------------------+  |                      |                          |
|  |                [3]                |  |                      |                          |
|  +-----------------------------------+  |                      |                          |
|                                         |                      |                          |
|          [4]                            |                      |                          |
|                                         |                      |                          |
+-----------------------------------------+-------------------------------------------------+
```

### **Leyenda (Mapeo de elementos)**

* **Panel Izquierdo (Navegación/Lista de Fases):**
    * `[1]` **Fase 1**: Tarjeta o contenedor redondeado superior.
    * `[2]` **Fase 2**: Tarjeta o contenedor redondeado central.
    * `[3]` **Fase 3**: Tarjeta o contenedor redondeado inferior.
    * `[4]` **....... Scroll con el resto de fases**: Indicador de desplazamiento (scroll) vertical para ver más elementos de la lista.

* **Panel Derecho (Área de Trabajo/Detalles dividida en dos columnas):**
    * **Columna Izquierda (Estado actual/espera):**
        * `[5]` **filtro variante**: Control de filtrado en la parte superior.
        * `[6]` **filtro fase**: Control de filtrado en la parte superior.
        * `[7]` **Pipeline de ejecución o en espera de ejecución**: Área de contenido principal.
    * **Columna Derecha (Resultados/Histórico):**
        * `[8]` **filtro varinte** *(sic, variante)*: Control de filtrado.
        * `[9]` **filtro fase**: Control de filtrado.
        * `[10]` **Variatnes ejectudas con exito o falladas** *(sic, Variantes ejecutadas con éxito o falladas)*: Área de contenido principal.

*(Nota: He incluido los textos exactamente como aparecen en la imagen original, señalando los pequeños errores tipográficos para que el contexto sea 100% preciso para el agente de IA).*

## Interfaz componente de la tarjeta
```bash 
+---- [1] FASE X ------------------------------------------------------------+
|                                   +----------------------------------+ [5] |
|  [2] Variant: Inpt. Numero        |                                  |     |
|                                   |                                  |     |
|  [3] parent                       |          [4] parametros          |     | 
|                                   |                                  |     |
|                                   +----------------------------------+     |
+----------------------------------------------------------------------------+
```

## **Leyenda (Mapeo de elementos)**

* **Contenedor Principal:**
    * `[1]` **FASE X**: Título del contenedor, posicionado de forma superpuesta interrumpiendo el borde superior izquierdo.

* **Sección Izquierda (Información/Inputs):**
    * `[2]` **Variant: Inpt. Numero**: Etiqueta de texto y presumiblemente un campo de entrada numérico (*Input*).
    * `[3]` **parent**: Etiqueta de texto situada debajo del elemento anterior.

* **Sección Central (Área de Trabajo):**
    * `[4]` **parametros**: Un contenedor interno rectangular más grande (podría representar un área de texto, una tabla o un espacio para configuraciones adicionales).

* **Sección Derecha (Acciones):**
    * `[5]` **boton**: Un botón de acción alineado al extremo derecho del contenedor principal.