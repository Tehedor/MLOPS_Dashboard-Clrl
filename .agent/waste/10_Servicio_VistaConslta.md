# 10 Vista de consulta
El obejetivo de esta vista es tener una interfaz grafica wrapper de peticiones desde la cual podemos lanzar eventos de ejecución sin la necesidad de herramientas externas como puede ser curl. Este estará compuesta por difertes cajas, una caja por fase, desde la cual se puede nombral y meter parametros para crear y ejecutar estas variantes de cada fase. Además, esta vista tendrá un forma de ir administrando estas peticiones, ver las que se han ejecutado, las que se estan ejecutando y las que han fallado. Además, de que si encuentra que alguna fase depende de una anterior esperará a que termine el parent antes de ejecutar la siguiente para tener un control total sobre las mismas.

## Código de html dianamico 
Los parametros de las variatntes serán creados de manera dinamica a partir de un file llamado "traceability_schema.yaml", donde vendrá definido todos estos campos.


## Interfaz
Vsita estrucutra de la página.

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

#### Interfaz de las fases
Las tarjetas de cada fase quiero que tenga este formato, sientete libre de crear los compoentes visuales para que quede mas bonito, pero el foramto que sea este

```text
+---- [1] FASE X ---------------------------------------------------------+
|                                   +----------------------------------+  |
|  [2] Variant: Inpt. Numero        |                                  |  |  [5] boton
|                                   |                                  |  |
|  [3] parent input                 |          [4] parametros          |  |  
|                                   |                                  |  |
|                                   +----------------------------------+  |
+-------------------------------------------------------------------------+
```

### **Leyenda (Mapeo de elementos)**

* **Contenedor Principal:**
    * `[1]` **FASE X**: Título del contenedor, posicionado de forma superpuesta interrumpiendo el borde superior izquierdo.

* **Sección Izquierda (Información/Inputs):**
    * `[2]` **Variant: Inpt. Numero**: Etiqueta de texto y presumiblemente un campo de entrada numérico (*Input*).
    * `[3]` **parent**: Etiqueta de texto situada debajo del elemento anterior.

* **Sección Central (Área de Trabajo):**
    * `[4]` **parametros**: Un contenedor interno rectangular más grande (podría representar un área de texto, una tabla o un espacio para configuraciones adicionales).

* **Sección Derecha (Acciones):**
    * `[5]` **boton**: Un botón de acción alineado al extremo derecho del contenedor principal.



## Funcionamiento
Esta aplciación gestiornar todas las ejecuciones de las fases/variante, además de que tendrá un lógica interna para gistionar los runners, osea solo podrá ejecutar alguna fase en correspondiente runner como viene definido en fases_execution_runners.yaml, debiendo al mismo timepo gestionar la cantidad maxima de fases que se pueden mandar y cuando este en su maximo que se queden en cola el resto de solicitudes.
Además, de que el servicio se debe encargar de que si depende de un parent que esta en ejecución deberá esperar a que este termine y si no exite el parent que salga un aviso.



