

# Dashboard cotrol MLOPS
Aplicación global desde la cual se puede gestionar, ver y administrar toda la gestión de un proeycto de MLOPS. Esta aplicación sera containerizada en Docker siendo una aplciación cliente-servidor para que se pueda utilizar tanto self-hosted en nuestro oredenador local como en un servidor externo.

Esta aplciación tendrá diferentes tabs donde cada vista tendrá una interfaz diferente.

## Descripción del proyecto MLOPS
Este proyecto consiste en un workflow de mlops dividido en 7 fases diferentes. Cada una de estas fases tendrá un función en el flujo, como puede ser en la fase1 siendo de exploración, la 3 de creación de ventanas, 7 de compilado .... Estas fases tienen definidos diferentes parametros para oredanr lo uq ese hace en cada fase. Si ejectuamos la fase con unos paremots aparecen las variantes, estas son ejecuciones de una fase a la cual se introducen los parametros para su ejecución.
Por lo tatno tenemos variantes/fase. Cada variante de una fase estará enlazada a una anterior, de la cual heredará confiruacioens.

Para automtizar y poder paralelizar estas ejecuciones aparecen los jobs de github actions donde se ejecutarán las diferetes variantes/fase. Para ejecutarlas usaremos una api trigger de github actions la cual se encargará de recibir los parametros de curl, o cualquier otro tipo de envio de datos, al worflow de trigger, ordenando el mismo cual workflow de fase ejecutar.

> Despues apareceran ejemplos de petciones de curl y de variantes/fases con sus parametros, son de una versión beta, no tener en cuenta ni nombre ni parametros 


El diseño actual *beta* interno en github actions :
1. Trigger: Encargado de recibir las peticions y ordenar worflow a ejecutar
	a. 61_mlops_Orchestator_trigger.yml 
2. Workflow de fase, donde estan definido toda ejecución necesaria para crear un job de una fase:
    a. reusable_fase1-Explore.yml
    b. reusable_fase2-PrepareEvents.yml
    c. reusable_fase3-PrepareWindows.yml
    d. reusable_fase4-TargetEngineering.yml
    e. reusable_fase5-Modeling.yml
    f. reusable_fase6-Quantiza&packageForEdge.yml
    g. reusable_fase7-ValidateModelEdgeHardware.yml
    h. reusable_fase8-ValidateMulti-ModelEdgeSystem.yml

### Peticiones de ejemplo de curl *beta*
```bash 
@TOKEN_FINE_GRAINED_AQUI = github_pat_****

### Fase setup
f01_explore  
f02_events   
f03_windows  
f04_targets  
f05_modeling  
f06_quant     
f07_modval  
f08_sysval

### Fase 1
POST https://api.github.com/repos/Tehedor/MLOps_actions_v2/dispatches
Accept: application/vnd.github.v3+json
Authorization: Bearer {{TOKEN_FINE_GRAINED_AQUI}}
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{
  "event_type": "ejecutar-fase-api",
  "client_payload": {
    "fase": "01_explore",
    "variant_id": "v001",
    "params": {
      "RAW": "./data/raw.csv",
      "CLEANING": "basic",
      "NAN_VALUES": "[-999999]"
    }
  }
}

### Fase 2
POST https://api.github.com/repos/Tehedor/MLOps_actions_v2/dispatches
Accept: application/vnd.github.v3+json
Authorization: Bearer {{TOKEN_FINE_GRAINED_AQUI}}
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{
  "event_type": "ejecutar-fase-api",
  "client_payload": {
    "fase": "02_prepareeventsds",
    "variant_id": "v202",
    "parent_variant": "v001",
    "params": {
      "STRATEGY": "transitions",
      "BANDS": [10, 90],
      "NAN_MODE": "discard"
    }
  }
}

### Fase 3
POST https://api.github.com/repos/Tehedor/MLOps_actions_v2/dispatches
Accept: application/vnd.github.v3+json
Authorization: Bearer {{TOKEN_FINE_GRAINED_AQUI}}
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{
  "event_type": "ejecutar-fase-api",
  "client_payload": {
    "fase": "03_preparewindowsds",
    "variant_id": "v302",
    "parent_variant": "v202",
    "params": {
      "OW": 600,
      "LT": 100,
      "PW": 100,
      "STRATEGY": "synchro",
      "NAN_MODE": "discard"
    }
  }
}

### Fase 4
POST https://api.github.com/repos/Tehedor/MLOps_actions_v2/dispatches
Accept: application/vnd.github.v3+json
Authorization: Bearer {{TOKEN_FINE_GRAINED_AQUI}}
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{
  "event_type": "ejecutar-fase-api",
  "client_payload": {
    "fase": "04_targetengineering",
    "variant_id": "v401",
    "parent_variant": "v302",
    "catalog_variant": "v202",
    "params": {
      "NAME": "battery_overheat",
      "OPERATOR": "OR",
      "EVENTS": ["Battery_Active_Power_0_10-to-90_100,Battery_Active_Power_10_90-to-90_100"]
    }
  }
}

### Fase 5
POST https://api.github.com/repos/Tehedor/MLOps_actions_v2/dispatches
Accept: application/vnd.github.v3+json
Authorization: Bearer {{TOKEN_FINE_GRAINED_AQUI}}
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{
  "event_type": "ejecutar-fase-api",
  "client_payload": {
    "fase": "05_modeling",
    "variant_id": "v502",
    "parent_variant": "v401",
    "params": {
      "MODEL_FAMILY": "cnn1d",
      "IMBALANCE_STRATEGY": "rare_events"
    }
  }
}

### Fase 6
POST https://api.github.com/repos/Tehedor/MLOps_actions_v2/dispatches
Accept: application/vnd.github.v3+json
Authorization: Bearer {{TOKEN_FINE_GRAINED_AQUI}}
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{
  "event_type": "ejecutar-fase-api",
  "client_payload": {
    "fase": "06_packaging",
    "variant_id": "v601",
    "parent_variant": "v502",
    "params": {}
  }
}

### Fase 7
POST https://api.github.com/repos/Tehedor/MLOps_actions_v2/dispatches
Accept: application/vnd.github.v3+json
Authorization: Bearer {{TOKEN_FINE_GRAINED_AQUI}}
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{
  "event_type": "ejecutar-fase-api",
  "client_payload": {
    "fase": "07_deployrun",
    "variant_id": "v701",
    "parent_variant": "v601",
    "params": {
      "PLATFORM": "esp32",
      "MTI_MS": 100,
      "TIME_SCALE": 0.01
    }
  }
}

### Fase 8 - parents_variant como CSV
POST https://api.github.com/repos/Tehedor/MLOps_actions_v2/dispatches
Accept: application/vnd.github.v3+json
Authorization: Bearer {{TOKEN_FINE_GRAINED_AQUI}}
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json

{
  "event_type": "ejecutar-fase-api",
  "client_payload": {
    "fase": "08_multimodelsystem",
    "variant_id": "v803",
    "parents_variant": "v701,v703",
    "params": {
      "PLATFORM": "esp32",
      "MTI_MS": 100,
      "TIME_SCALE": 0.01
    }
  }
}
```


## Vistas
Cada vista de esto tendrá un tab para poder acceder a cada una de ellas

### Inicio
Esta vista tendrá un pequeña vista general de todas las variantes/fase ejecutadas en el proyecto, desde esta vista poderemos ver los parametros de cada variante/fase más de donde provienen, si se esta ejecutando con un pequeño spiner, si han fallado, si queremos elimnarlas, etc. Esta vista viene inspirada en un html dinamico que se regenera cada vez que ejecutamos una variante/fase. Por lo tanto nos basaremos en el mismo además de añdirle la integración con github actions para añadir las neuvas funcioanlidades par ver si se esta ejectuadno, eseprando a que temrine un parent para ejecutarse, o si ha fallado.


#### Código de html dianamico 
Este código en html, js y css, pertenece a una funcionalidad interna del proyecto mlops en el cual cada vez que se ejecuta una fase/variante se regenerá añadiendo la nueva variante marcadno sus parents. No tener en cuenta del todo ya que solo es orientativo
```html
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>MLOps Pipeline Lineage</title>
        <style>
    /* Reseteamos el body para que no genere scroll extra */
    body { 
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
        background-color: #f8f9fa; 
        margin: 0; 
        padding: 0; 
        overflow: hidden; /* Oculta el scrollbar general de la ventana */
        height: 100vh;
        width: 100vw;
    }
    
    /* El contenedor es el único que hace scroll */
    .pipeline-container { 
        display: flex; 
        flex-direction: row; 
        gap: 80px; 
        overflow: auto; /* Único scrollbar aquí */
        padding: 40px; 
        box-sizing: border-box;
        height: 100%;
        align-items: flex-start; 
    }
    
    .phase-column { 
        display: flex; 
        flex-direction: column; 
        gap: 30px; 
        min-width: 220px; 
        flex-shrink: 0; /* EVITA QUE LAS CAJAS SE APLASTEN O DESAPAREZCAN */
        background: #fff; 
        padding: 15px; 
        border-radius: 10px; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.05); 
        border-top: 4px solid #dee2e6;
        position: relative;
        z-index: 1;
    }
    
    .phase-title { text-align: center; color: #343a40; font-size: 1rem; margin-bottom: 10px; border-bottom: 2px solid #e9ecef; padding-bottom: 10px; text-transform: uppercase; font-weight: bold; }
    
    .variant-card {
        border-width: 2px; border-style: solid; border-radius: 8px; padding: 15px;
        cursor: pointer; transition: all 0.2s ease; text-align: center; font-weight: 600;
        position: relative; z-index: 2; 
    }
    .variant-card:hover { transform: translateY(-3px); box-shadow: 0 6px 12px rgba(0,0,0,0.1); filter: brightness(0.95); }
    
    #config-panel {
        position: fixed; top: 0; right: -450px; width: 400px; height: 100vh; background: white;
        box-shadow: -4px 0 15px rgba(0,0,0,0.1); transition: right 0.3s ease; padding: 20px; overflow-y: auto; z-index: 10;
        box-sizing: border-box;
    }
    #config-panel.open { right: 0; }
    .close-btn { cursor: pointer; color: red; float: right; font-weight: bold; }
    pre { background: #f1f3f5; padding: 10px; border-radius: 5px; overflow-x: auto; font-size: 0.85rem; }
</style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/leader-line/1.0.7/leader-line.min.js"></script>
    </head>
    <body>
        <div class="pipeline-container" id="pipeline-container">
            <div class="phase-column" id="col_f01_explore" style="border-top-color: #90CAF9"><div class="phase-title">f01_explore</div><div class="variant-card" id="f01_explore_v100" style="background-color: #E3F2FD; border-color: #90CAF9; color: #1565C0;" onclick="showConfig('f01_explore_v100')" onmouseenter="highlightLines('f01_explore_v100')" onmouseleave="resetLines()">v100</div><div class="variant-card" id="f01_explore_v101" style="background-color: #E3F2FD; border-color: #90CAF9; color: #1565C0;" onclick="showConfig('f01_explore_v101')" onmouseenter="highlightLines('f01_explore_v101')" onmouseleave="resetLines()">v101</div></div><div class="phase-column" id="col_f02_events" style="border-top-color: #A5D6A7"><div class="phase-title">f02_events</div><div class="variant-card" id="f02_events_v200" style="background-color: #E8F5E9; border-color: #A5D6A7; color: #2E7D32;" onclick="showConfig('f02_events_v200')" onmouseenter="highlightLines('f02_events_v200')" onmouseleave="resetLines()">v200</div><div class="variant-card" id="f02_events_v201" style="background-color: #E8F5E9; border-color: #A5D6A7; color: #2E7D32;" onclick="showConfig('f02_events_v201')" onmouseenter="highlightLines('f02_events_v201')" onmouseleave="resetLines()">v201</div></div><div class="phase-column" id="col_f03_windows" style="border-top-color: #FFCC80"><div class="phase-title">f03_windows</div><div class="variant-card" id="f03_windows_v300" style="background-color: #FFF3E0; border-color: #FFCC80; color: #EF6C00;" onclick="showConfig('f03_windows_v300')" onmouseenter="highlightLines('f03_windows_v300')" onmouseleave="resetLines()">v300</div><div class="variant-card" id="f03_windows_v301" style="background-color: #FFF3E0; border-color: #FFCC80; color: #EF6C00;" onclick="showConfig('f03_windows_v301')" onmouseenter="highlightLines('f03_windows_v301')" onmouseleave="resetLines()">v301</div><div class="variant-card" id="f03_windows_v302" style="background-color: #FFF3E0; border-color: #FFCC80; color: #EF6C00;" onclick="showConfig('f03_windows_v302')" onmouseenter="highlightLines('f03_windows_v302')" onmouseleave="resetLines()">v302</div></div><div class="phase-column" id="col_f04_targets" style="border-top-color: #CE93D8"><div class="phase-title">f04_targets</div><div class="variant-card" id="f04_targets_v400" style="background-color: #F3E5F5; border-color: #CE93D8; color: #6A1B9A;" onclick="showConfig('f04_targets_v400')" onmouseenter="highlightLines('f04_targets_v400')" onmouseleave="resetLines()">v400</div><div class="variant-card" id="f04_targets_v401" style="background-color: #F3E5F5; border-color: #CE93D8; color: #6A1B9A;" onclick="showConfig('f04_targets_v401')" onmouseenter="highlightLines('f04_targets_v401')" onmouseleave="resetLines()">v401</div><div class="variant-card" id="f04_targets_v402" style="background-color: #F3E5F5; border-color: #CE93D8; color: #6A1B9A;" onclick="showConfig('f04_targets_v402')" onmouseenter="highlightLines('f04_targets_v402')" onmouseleave="resetLines()">v402</div><div class="variant-card" id="f04_targets_v403" style="background-color: #F3E5F5; border-color: #CE93D8; color: #6A1B9A;" onclick="showConfig('f04_targets_v403')" onmouseenter="highlightLines('f04_targets_v403')" onmouseleave="resetLines()">v403</div><div class="variant-card" id="f04_targets_v404" style="background-color: #F3E5F5; border-color: #CE93D8; color: #6A1B9A;" onclick="showConfig('f04_targets_v404')" onmouseenter="highlightLines('f04_targets_v404')" onmouseleave="resetLines()">v404</div><div class="variant-card" id="f04_targets_v405" style="background-color: #F3E5F5; border-color: #CE93D8; color: #6A1B9A;" onclick="showConfig('f04_targets_v405')" onmouseenter="highlightLines('f04_targets_v405')" onmouseleave="resetLines()">v405</div><div class="variant-card" id="f04_targets_v406" style="background-color: #F3E5F5; border-color: #CE93D8; color: #6A1B9A;" onclick="showConfig('f04_targets_v406')" onmouseenter="highlightLines('f04_targets_v406')" onmouseleave="resetLines()">v406</div><div class="variant-card" id="f04_targets_v407" style="background-color: #F3E5F5; border-color: #CE93D8; color: #6A1B9A;" onclick="showConfig('f04_targets_v407')" onmouseenter="highlightLines('f04_targets_v407')" onmouseleave="resetLines()">v407</div><div class="variant-card" id="f04_targets_v408" style="background-color: #F3E5F5; border-color: #CE93D8; color: #6A1B9A;" onclick="showConfig('f04_targets_v408')" onmouseenter="highlightLines('f04_targets_v408')" onmouseleave="resetLines()">v408</div></div><div class="phase-column" id="col_f05_modeling" style="border-top-color: #EF9A9A"><div class="phase-title">f05_modeling</div><div class="variant-card" id="f05_modeling_v500" style="background-color: #FFEBEE; border-color: #EF9A9A; color: #C62828;" onclick="showConfig('f05_modeling_v500')" onmouseenter="highlightLines('f05_modeling_v500')" onmouseleave="resetLines()">v500</div><div class="variant-card" id="f05_modeling_v501" style="background-color: #FFEBEE; border-color: #EF9A9A; color: #C62828;" onclick="showConfig('f05_modeling_v501')" onmouseenter="highlightLines('f05_modeling_v501')" onmouseleave="resetLines()">v501</div><div class="variant-card" id="f05_modeling_v502" style="background-color: #FFEBEE; border-color: #EF9A9A; color: #C62828;" onclick="showConfig('f05_modeling_v502')" onmouseenter="highlightLines('f05_modeling_v502')" onmouseleave="resetLines()">v502</div><div class="variant-card" id="f05_modeling_v503" style="background-color: #FFEBEE; border-color: #EF9A9A; color: #C62828;" onclick="showConfig('f05_modeling_v503')" onmouseenter="highlightLines('f05_modeling_v503')" onmouseleave="resetLines()">v503</div><div class="variant-card" id="f05_modeling_v504" style="background-color: #FFEBEE; border-color: #EF9A9A; color: #C62828;" onclick="showConfig('f05_modeling_v504')" onmouseenter="highlightLines('f05_modeling_v504')" onmouseleave="resetLines()">v504</div><div class="variant-card" id="f05_modeling_v505" style="background-color: #FFEBEE; border-color: #EF9A9A; color: #C62828;" onclick="showConfig('f05_modeling_v505')" onmouseenter="highlightLines('f05_modeling_v505')" onmouseleave="resetLines()">v505</div><div class="variant-card" id="f05_modeling_v506" style="background-color: #FFEBEE; border-color: #EF9A9A; color: #C62828;" onclick="showConfig('f05_modeling_v506')" onmouseenter="highlightLines('f05_modeling_v506')" onmouseleave="resetLines()">v506</div><div class="variant-card" id="f05_modeling_v507" style="background-color: #FFEBEE; border-color: #EF9A9A; color: #C62828;" onclick="showConfig('f05_modeling_v507')" onmouseenter="highlightLines('f05_modeling_v507')" onmouseleave="resetLines()">v507</div><div class="variant-card" id="f05_modeling_v508" style="background-color: #FFEBEE; border-color: #EF9A9A; color: #C62828;" onclick="showConfig('f05_modeling_v508')" onmouseenter="highlightLines('f05_modeling_v508')" onmouseleave="resetLines()">v508</div></div><div class="phase-column" id="col_f06_quant" style="border-top-color: #80DEEA"><div class="phase-title">f06_quant</div><div class="variant-card" id="f06_quant_v600" style="background-color: #E0F7FA; border-color: #80DEEA; color: #006064;" onclick="showConfig('f06_quant_v600')" onmouseenter="highlightLines('f06_quant_v600')" onmouseleave="resetLines()">v600</div><div class="variant-card" id="f06_quant_v601" style="background-color: #E0F7FA; border-color: #80DEEA; color: #006064;" onclick="showConfig('f06_quant_v601')" onmouseenter="highlightLines('f06_quant_v601')" onmouseleave="resetLines()">v601</div><div class="variant-card" id="f06_quant_v602" style="background-color: #E0F7FA; border-color: #80DEEA; color: #006064;" onclick="showConfig('f06_quant_v602')" onmouseenter="highlightLines('f06_quant_v602')" onmouseleave="resetLines()">v602</div><div class="variant-card" id="f06_quant_v603" style="background-color: #E0F7FA; border-color: #80DEEA; color: #006064;" onclick="showConfig('f06_quant_v603')" onmouseenter="highlightLines('f06_quant_v603')" onmouseleave="resetLines()">v603</div><div class="variant-card" id="f06_quant_v604" style="background-color: #E0F7FA; border-color: #80DEEA; color: #006064;" onclick="showConfig('f06_quant_v604')" onmouseenter="highlightLines('f06_quant_v604')" onmouseleave="resetLines()">v604</div><div class="variant-card" id="f06_quant_v605" style="background-color: #E0F7FA; border-color: #80DEEA; color: #006064;" onclick="showConfig('f06_quant_v605')" onmouseenter="highlightLines('f06_quant_v605')" onmouseleave="resetLines()">v605</div><div class="variant-card" id="f06_quant_v606" style="background-color: #E0F7FA; border-color: #80DEEA; color: #006064;" onclick="showConfig('f06_quant_v606')" onmouseenter="highlightLines('f06_quant_v606')" onmouseleave="resetLines()">v606</div><div class="variant-card" id="f06_quant_v607" style="background-color: #E0F7FA; border-color: #80DEEA; color: #006064;" onclick="showConfig('f06_quant_v607')" onmouseenter="highlightLines('f06_quant_v607')" onmouseleave="resetLines()">v607</div><div class="variant-card" id="f06_quant_v608" style="background-color: #E0F7FA; border-color: #80DEEA; color: #006064;" onclick="showConfig('f06_quant_v608')" onmouseenter="highlightLines('f06_quant_v608')" onmouseleave="resetLines()">v608</div></div><div class="phase-column" id="col_f07_modval" style="border-top-color: #B0BEC5"><div class="phase-title">f07_modval</div><div class="variant-card" id="f07_modval_v700" style="background-color: #ECEFF1; border-color: #B0BEC5; color: #37474F;" onclick="showConfig('f07_modval_v700')" onmouseenter="highlightLines('f07_modval_v700')" onmouseleave="resetLines()">v700</div><div class="variant-card" id="f07_modval_v701" style="background-color: #ECEFF1; border-color: #B0BEC5; color: #37474F;" onclick="showConfig('f07_modval_v701')" onmouseenter="highlightLines('f07_modval_v701')" onmouseleave="resetLines()">v701</div><div class="variant-card" id="f07_modval_v702" style="background-color: #ECEFF1; border-color: #B0BEC5; color: #37474F;" onclick="showConfig('f07_modval_v702')" onmouseenter="highlightLines('f07_modval_v702')" onmouseleave="resetLines()">v702</div><div class="variant-card" id="f07_modval_v703" style="background-color: #ECEFF1; border-color: #B0BEC5; color: #37474F;" onclick="showConfig('f07_modval_v703')" onmouseenter="highlightLines('f07_modval_v703')" onmouseleave="resetLines()">v703</div><div class="variant-card" id="f07_modval_v704" style="background-color: #ECEFF1; border-color: #B0BEC5; color: #37474F;" onclick="showConfig('f07_modval_v704')" onmouseenter="highlightLines('f07_modval_v704')" onmouseleave="resetLines()">v704</div><div class="variant-card" id="f07_modval_v705" style="background-color: #ECEFF1; border-color: #B0BEC5; color: #37474F;" onclick="showConfig('f07_modval_v705')" onmouseenter="highlightLines('f07_modval_v705')" onmouseleave="resetLines()">v705</div><div class="variant-card" id="f07_modval_v706" style="background-color: #ECEFF1; border-color: #B0BEC5; color: #37474F;" onclick="showConfig('f07_modval_v706')" onmouseenter="highlightLines('f07_modval_v706')" onmouseleave="resetLines()">v706</div><div class="variant-card" id="f07_modval_v707" style="background-color: #ECEFF1; border-color: #B0BEC5; color: #37474F;" onclick="showConfig('f07_modval_v707')" onmouseenter="highlightLines('f07_modval_v707')" onmouseleave="resetLines()">v707</div><div class="variant-card" id="f07_modval_v708" style="background-color: #ECEFF1; border-color: #B0BEC5; color: #37474F;" onclick="showConfig('f07_modval_v708')" onmouseenter="highlightLines('f07_modval_v708')" onmouseleave="resetLines()">v708</div><div class="variant-card" id="f07_modval_v710" style="background-color: #ECEFF1; border-color: #B0BEC5; color: #37474F;" onclick="showConfig('f07_modval_v710')" onmouseenter="highlightLines('f07_modval_v710')" onmouseleave="resetLines()">v710</div></div><div class="phase-column" id="col_f08_sysval" style="border-top-color: #E6EE9C"><div class="phase-title">f08_sysval</div><div class="variant-card" id="f08_sysval_v800" style="background-color: #F9FBE7; border-color: #E6EE9C; color: #827717;" onclick="showConfig('f08_sysval_v800')" onmouseenter="highlightLines('f08_sysval_v800')" onmouseleave="resetLines()">v800</div><div class="variant-card" id="f08_sysval_v801" style="background-color: #F9FBE7; border-color: #E6EE9C; color: #827717;" onclick="showConfig('f08_sysval_v801')" onmouseenter="highlightLines('f08_sysval_v801')" onmouseleave="resetLines()">v801</div><div class="variant-card" id="f08_sysval_v802" style="background-color: #F9FBE7; border-color: #E6EE9C; color: #827717;" onclick="showConfig('f08_sysval_v802')" onmouseenter="highlightLines('f08_sysval_v802')" onmouseleave="resetLines()">v802</div><div class="variant-card" id="f08_sysval_v803" style="background-color: #F9FBE7; border-color: #E6EE9C; color: #827717;" onclick="showConfig('f08_sysval_v803')" onmouseenter="highlightLines('f08_sysval_v803')" onmouseleave="resetLines()">v803</div></div>
        </div>

        <div id="config-panel">
            <span class="close-btn" onclick="closeConfig()">Cerrar ✕</span>
            <h2 id="config-title">Configuración</h2>
            <pre id="config-content">Selecciona una variante...</pre>
        </div>

        <script>
            let lines = [];
            const variantConfigs = {"f01_explore_v100": {"phase": "f01_explore", "variant": "v100", "parent": null, "parameters": {"raw_path": "data/raw.csv", "cleaning": "basic", "nan_values": [-999999]}}, "f01_explore_v101": {"phase": "f01_explore", "variant": "v101", "parent": null, "parameters": {"raw_path": "data/raw.csv", "cleaning": "basic", "nan_values": [-999999], "first_line": 1, "max_lines": 50000}}, "f02_events_v200": {"phase": "f02_events", "variant": "v200", "parent": "v100", "parameters": {"Tu": 10, "strategy": "transitions", "bands": [40, 60, 80], "nan_mode": "keep"}}, "f02_events_v201": {"phase": "f02_events", "variant": "v201", "parent": "v100", "parameters": {"Tu": 10, "strategy": "transitions", "bands": [10, 20, 40, 60, 80, 90], "nan_mode": "keep"}}, "f03_windows_v300": {"phase": "f03_windows", "variant": "v300", "parent": "v200", "parameters": {"parent_variant": "v200", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "window_strategy": "synchro", "nan_mode": "discard"}}, "f03_windows_v301": {"phase": "f03_windows", "variant": "v301", "parent": "v200", "parameters": {"parent_variant": "v200", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "window_strategy": "asynOW", "nan_mode": "discard"}}, "f03_windows_v302": {"phase": "f03_windows", "variant": "v302", "parent": "v201", "parameters": {"parent_variant": "v201", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "window_strategy": "asynOW", "nan_mode": "discard"}}, "f04_targets_v400": {"phase": "f04_targets", "variant": "v400", "parent": "v300", "parameters": {"parent_variant": "v300", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "event_type_count": 221, "prediction_name": "Battery_Active_Power_any-to-80_100", "target_operator": "OR", "target_event_types": ["Battery_Active_Power_0_40-to-80_100", "Battery_Active_Power_40_60-to-80_100", "Battery_Active_Power_60_80-to-80_100"]}}, "f04_targets_v401": {"phase": "f04_targets", "variant": "v401", "parent": "v300", "parameters": {"parent_variant": "v300", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "event_type_count": 221, "prediction_name": "Battery_Active_Power_Set_Response_any-to-80_100", "target_operator": "OR", "target_event_types": ["Battery_Active_Power_Set_Response_0_40-to-80_100", "Battery_Active_Power_Set_Response_40_60-to-80_100", "Battery_Active_Power_Set_Response_60_80-to-80_100"]}}, "f04_targets_v402": {"phase": "f04_targets", "variant": "v402", "parent": "v300", "parameters": {"parent_variant": "v300", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "event_type_count": 221, "prediction_name": "PVPCS_Active_Power_any-to-80_100", "target_operator": "OR", "target_event_types": ["PVPCS_Active_Power_0_40-to-80_100", "PVPCS_Active_Power_40_60-to-80_100", "PVPCS_Active_Power_60_80-to-80_100"]}}, "f04_targets_v403": {"phase": "f04_targets", "variant": "v403", "parent": "v300", "parameters": {"parent_variant": "v300", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "event_type_count": 221, "prediction_name": "GE_Active_Power_any-to-80_100", "target_operator": "OR", "target_event_types": ["GE_Active_Power_0_40-to-80_100", "GE_Active_Power_40_60-to-80_100", "GE_Active_Power_60_80-to-80_100"]}}, "f04_targets_v404": {"phase": "f04_targets", "variant": "v404", "parent": "v300", "parameters": {"parent_variant": "v300", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "event_type_count": 221, "prediction_name": "GE_Body_Active_Power_any-to-80_100", "target_operator": "OR", "target_event_types": ["GE_Body_Active_Power_0_40-to-80_100", "GE_Body_Active_Power_40_60-to-80_100", "GE_Body_Active_Power_60_80-to-80_100"]}}, "f04_targets_v405": {"phase": "f04_targets", "variant": "v405", "parent": "v300", "parameters": {"parent_variant": "v300", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "event_type_count": 221, "prediction_name": "GE_Body_Active_Power_Set_Response_any-to-80_100", "target_operator": "OR", "target_event_types": ["GE_Body_Active_Power_Set_Response_0_40-to-80_100", "GE_Body_Active_Power_Set_Response_40_60-to-80_100", "GE_Body_Active_Power_Set_Response_60_80-to-80_100"]}}, "f04_targets_v406": {"phase": "f04_targets", "variant": "v406", "parent": "v300", "parameters": {"parent_variant": "v300", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "event_type_count": 221, "prediction_name": "FC_Active_Power_FC_END_Set_any-to-80_100", "target_operator": "OR", "target_event_types": ["FC_Active_Power_FC_END_Set_0_40-to-80_100", "FC_Active_Power_FC_END_Set_40_60-to-80_100", "FC_Active_Power_FC_END_Set_60_80-to-80_100"]}}, "f04_targets_v407": {"phase": "f04_targets", "variant": "v407", "parent": "v300", "parameters": {"parent_variant": "v300", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "event_type_count": 221, "prediction_name": "FC_Active_Power_any-to-80_100", "target_operator": "OR", "target_event_types": ["FC_Active_Power_0_40-to-80_100", "FC_Active_Power_40_60-to-80_100", "FC_Active_Power_60_80-to-80_100"]}}, "f04_targets_v408": {"phase": "f04_targets", "variant": "v408", "parent": "v300", "parameters": {"parent_variant": "v300", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "event_type_count": 221, "prediction_name": "MG-LV-MSB_AC_Voltage_any-to-80_100", "target_operator": "OR", "target_event_types": ["MG-LV-MSB_AC_Voltage_0_40-to-80_100", "MG-LV-MSB_AC_Voltage_40_60-to-80_100", "MG-LV-MSB_AC_Voltage_60_80-to-80_100"]}}, "f05_modeling_v500": {"phase": "f05_modeling", "variant": "v500", "parent": "v400", "parameters": {"parent_variant": "v400", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "Battery_Active_Power_any-to-80_100", "event_type_count": 221, "model_family": "cnn1d", "automl": {"enabled": true, "max_trials": 5, "seed": 42}, "search_space": {"common": {"batch_size": [128, 256], "learning_rate": [0.001, 0.0005], "n_layers": [1, 2], "units": [64, 128], "dropout": [0.0, 0.2]}, "dense_bow": {}, "sequence_embedding": {"embed_dim": [64, 128]}, "cnn1d": {"embed_dim": [64], "filters": [64, 128], "kernel_size": [3, 5]}}, "training": {"epochs": 20, "max_samples": null}, "evaluation": {"split": {"train": 0.7, "val": 0.15, "test": 0.15}}, "imbalance_strategy": "rare_events", "imbalance_max_majority_samples": 20000}}, "f05_modeling_v501": {"phase": "f05_modeling", "variant": "v501", "parent": "v401", "parameters": {"parent_variant": "v401", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "Battery_Active_Power_Set_Response_any-to-80_100", "event_type_count": 221, "model_family": "cnn1d", "automl": {"enabled": true, "max_trials": 5, "seed": 42}, "search_space": {"common": {"batch_size": [128, 256], "learning_rate": [0.001, 0.0005], "n_layers": [1, 2], "units": [64, 128], "dropout": [0.0, 0.2]}, "dense_bow": {}, "sequence_embedding": {"embed_dim": [64, 128]}, "cnn1d": {"embed_dim": [64], "filters": [64, 128], "kernel_size": [3, 5]}}, "training": {"epochs": 20, "max_samples": null}, "evaluation": {"split": {"train": 0.7, "val": 0.15, "test": 0.15}}, "imbalance_strategy": "rare_events", "imbalance_max_majority_samples": 20000}}, "f05_modeling_v502": {"phase": "f05_modeling", "variant": "v502", "parent": "v402", "parameters": {"parent_variant": "v402", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "PVPCS_Active_Power_any-to-80_100", "event_type_count": 221, "model_family": "cnn1d", "automl": {"enabled": true, "max_trials": 5, "seed": 42}, "search_space": {"common": {"batch_size": [128, 256], "learning_rate": [0.001, 0.0005], "n_layers": [1, 2], "units": [64, 128], "dropout": [0.0, 0.2]}, "dense_bow": {}, "sequence_embedding": {"embed_dim": [64, 128]}, "cnn1d": {"embed_dim": [64], "filters": [64, 128], "kernel_size": [3, 5]}}, "training": {"epochs": 20, "max_samples": null}, "evaluation": {"split": {"train": 0.7, "val": 0.15, "test": 0.15}}, "imbalance_strategy": "rare_events", "imbalance_max_majority_samples": 20000}}, "f05_modeling_v503": {"phase": "f05_modeling", "variant": "v503", "parent": "v403", "parameters": {"parent_variant": "v403", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "GE_Active_Power_any-to-80_100", "event_type_count": 221, "model_family": "cnn1d", "automl": {"enabled": true, "max_trials": 5, "seed": 42}, "search_space": {"common": {"batch_size": [128, 256], "learning_rate": [0.001, 0.0005], "n_layers": [1, 2], "units": [64, 128], "dropout": [0.0, 0.2]}, "dense_bow": {}, "sequence_embedding": {"embed_dim": [64, 128]}, "cnn1d": {"embed_dim": [64], "filters": [64, 128], "kernel_size": [3, 5]}}, "training": {"epochs": 20, "max_samples": null}, "evaluation": {"split": {"train": 0.7, "val": 0.15, "test": 0.15}}, "imbalance_strategy": "rare_events", "imbalance_max_majority_samples": 20000}}, "f05_modeling_v504": {"phase": "f05_modeling", "variant": "v504", "parent": "v404", "parameters": {"parent_variant": "v404", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "GE_Body_Active_Power_any-to-80_100", "event_type_count": 221, "model_family": "cnn1d", "automl": {"enabled": true, "max_trials": 5, "seed": 42}, "search_space": {"common": {"batch_size": [128, 256], "learning_rate": [0.001, 0.0005], "n_layers": [1, 2], "units": [64, 128], "dropout": [0.0, 0.2]}, "dense_bow": {}, "sequence_embedding": {"embed_dim": [64, 128]}, "cnn1d": {"embed_dim": [64], "filters": [64, 128], "kernel_size": [3, 5]}}, "training": {"epochs": 20, "max_samples": null}, "evaluation": {"split": {"train": 0.7, "val": 0.15, "test": 0.15}}, "imbalance_strategy": "rare_events", "imbalance_max_majority_samples": 20000}}, "f05_modeling_v505": {"phase": "f05_modeling", "variant": "v505", "parent": "v405", "parameters": {"parent_variant": "v405", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "GE_Body_Active_Power_Set_Response_any-to-80_100", "event_type_count": 221, "model_family": "cnn1d", "automl": {"enabled": true, "max_trials": 5, "seed": 42}, "search_space": {"common": {"batch_size": [128, 256], "learning_rate": [0.001, 0.0005], "n_layers": [1, 2], "units": [64, 128], "dropout": [0.0, 0.2]}, "dense_bow": {}, "sequence_embedding": {"embed_dim": [64, 128]}, "cnn1d": {"embed_dim": [64], "filters": [64, 128], "kernel_size": [3, 5]}}, "training": {"epochs": 20, "max_samples": null}, "evaluation": {"split": {"train": 0.7, "val": 0.15, "test": 0.15}}, "imbalance_strategy": "rare_events", "imbalance_max_majority_samples": 20000}}, "f05_modeling_v506": {"phase": "f05_modeling", "variant": "v506", "parent": "v406", "parameters": {"parent_variant": "v406", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "FC_Active_Power_FC_END_Set_any-to-80_100", "event_type_count": 221, "model_family": "cnn1d", "automl": {"enabled": true, "max_trials": 5, "seed": 42}, "search_space": {"common": {"batch_size": [128, 256], "learning_rate": [0.001, 0.0005], "n_layers": [1, 2], "units": [64, 128], "dropout": [0.0, 0.2]}, "dense_bow": {}, "sequence_embedding": {"embed_dim": [64, 128]}, "cnn1d": {"embed_dim": [64], "filters": [64, 128], "kernel_size": [3, 5]}}, "training": {"epochs": 20, "max_samples": null}, "evaluation": {"split": {"train": 0.7, "val": 0.15, "test": 0.15}}, "imbalance_strategy": "rare_events", "imbalance_max_majority_samples": 20000}}, "f05_modeling_v507": {"phase": "f05_modeling", "variant": "v507", "parent": "v407", "parameters": {"parent_variant": "v407", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "FC_Active_Power_any-to-80_100", "event_type_count": 221, "model_family": "cnn1d", "automl": {"enabled": true, "max_trials": 5, "seed": 42}, "search_space": {"common": {"batch_size": [128, 256], "learning_rate": [0.001, 0.0005], "n_layers": [1, 2], "units": [64, 128], "dropout": [0.0, 0.2]}, "dense_bow": {}, "sequence_embedding": {"embed_dim": [64, 128]}, "cnn1d": {"embed_dim": [64], "filters": [64, 128], "kernel_size": [3, 5]}}, "training": {"epochs": 20, "max_samples": null}, "evaluation": {"split": {"train": 0.7, "val": 0.15, "test": 0.15}}, "imbalance_strategy": "rare_events", "imbalance_max_majority_samples": 20000}}, "f05_modeling_v508": {"phase": "f05_modeling", "variant": "v508", "parent": "v408", "parameters": {"parent_variant": "v408", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "MG-LV-MSB_AC_Voltage_any-to-80_100", "event_type_count": 221, "model_family": "cnn1d", "automl": {"enabled": true, "max_trials": 5, "seed": 42}, "search_space": {"common": {"batch_size": [128, 256], "learning_rate": [0.001, 0.0005], "n_layers": [1, 2], "units": [64, 128], "dropout": [0.0, 0.2]}, "dense_bow": {}, "sequence_embedding": {"embed_dim": [64, 128]}, "cnn1d": {"embed_dim": [64], "filters": [64, 128], "kernel_size": [3, 5]}}, "training": {"epochs": 20, "max_samples": null}, "evaluation": {"split": {"train": 0.7, "val": 0.15, "test": 0.15}}, "imbalance_strategy": "rare_events", "imbalance_max_majority_samples": 20000}}, "f06_quant_v600": {"phase": "f06_quant", "variant": "v600", "parent": "v500", "parameters": {"parent_variant": "v500", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "Battery_Active_Power_any-to-80_100", "event_type_count": 221, "deployment": {"target": "esp32", "runtime": "esp-tflite-micro", "runtime_version": "1.3.3", "require_int8": true, "memory_limit_bytes": 327680}, "quantization": {"tflite_optimization": "DEFAULT", "representative_dataset": "val", "calibration_samples": 512, "symmetric_int8": true, "per_channel": true, "keep_float_fallback": false}, "thresholding": {"strategy": "recalibrate_on_quantized", "maximize_metric": "recall", "grid_points": 101}, "eedu": {"version": "1.0", "layout": "default"}}}, "f06_quant_v601": {"phase": "f06_quant", "variant": "v601", "parent": "v501", "parameters": {"parent_variant": "v501", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "Battery_Active_Power_Set_Response_any-to-80_100", "event_type_count": 221, "deployment": {"target": "esp32", "runtime": "esp-tflite-micro", "runtime_version": "1.3.3", "require_int8": true, "memory_limit_bytes": 327680}, "quantization": {"tflite_optimization": "DEFAULT", "representative_dataset": "val", "calibration_samples": 512, "symmetric_int8": true, "per_channel": true, "keep_float_fallback": false}, "thresholding": {"strategy": "recalibrate_on_quantized", "maximize_metric": "recall", "grid_points": 101}, "eedu": {"version": "1.0", "layout": "default"}}}, "f06_quant_v602": {"phase": "f06_quant", "variant": "v602", "parent": "v502", "parameters": {"parent_variant": "v502", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "PVPCS_Active_Power_any-to-80_100", "event_type_count": 221, "deployment": {"target": "esp32", "runtime": "esp-tflite-micro", "runtime_version": "1.3.3", "require_int8": true, "memory_limit_bytes": 327680}, "quantization": {"tflite_optimization": "DEFAULT", "representative_dataset": "val", "calibration_samples": 512, "symmetric_int8": true, "per_channel": true, "keep_float_fallback": false}, "thresholding": {"strategy": "recalibrate_on_quantized", "maximize_metric": "recall", "grid_points": 101}, "eedu": {"version": "1.0", "layout": "default"}}}, "f06_quant_v603": {"phase": "f06_quant", "variant": "v603", "parent": "v503", "parameters": {"parent_variant": "v503", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "GE_Active_Power_any-to-80_100", "event_type_count": 221, "deployment": {"target": "esp32", "runtime": "esp-tflite-micro", "runtime_version": "1.3.3", "require_int8": true, "memory_limit_bytes": 327680}, "quantization": {"tflite_optimization": "DEFAULT", "representative_dataset": "val", "calibration_samples": 512, "symmetric_int8": true, "per_channel": true, "keep_float_fallback": false}, "thresholding": {"strategy": "recalibrate_on_quantized", "maximize_metric": "recall", "grid_points": 101}, "eedu": {"version": "1.0", "layout": "default"}}}, "f06_quant_v604": {"phase": "f06_quant", "variant": "v604", "parent": "v504", "parameters": {"parent_variant": "v504", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "GE_Body_Active_Power_any-to-80_100", "event_type_count": 221, "deployment": {"target": "esp32", "runtime": "esp-tflite-micro", "runtime_version": "1.3.3", "require_int8": true, "memory_limit_bytes": 327680}, "quantization": {"tflite_optimization": "DEFAULT", "representative_dataset": "val", "calibration_samples": 512, "symmetric_int8": true, "per_channel": true, "keep_float_fallback": false}, "thresholding": {"strategy": "recalibrate_on_quantized", "maximize_metric": "recall", "grid_points": 101}, "eedu": {"version": "1.0", "layout": "default"}}}, "f06_quant_v605": {"phase": "f06_quant", "variant": "v605", "parent": "v505", "parameters": {"parent_variant": "v505", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "GE_Body_Active_Power_Set_Response_any-to-80_100", "event_type_count": 221, "deployment": {"target": "esp32", "runtime": "esp-tflite-micro", "runtime_version": "1.3.3", "require_int8": true, "memory_limit_bytes": 327680}, "quantization": {"tflite_optimization": "DEFAULT", "representative_dataset": "val", "calibration_samples": 512, "symmetric_int8": true, "per_channel": true, "keep_float_fallback": false}, "thresholding": {"strategy": "recalibrate_on_quantized", "maximize_metric": "recall", "grid_points": 101}, "eedu": {"version": "1.0", "layout": "default"}}}, "f06_quant_v606": {"phase": "f06_quant", "variant": "v606", "parent": "v506", "parameters": {"parent_variant": "v506", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "FC_Active_Power_FC_END_Set_any-to-80_100", "event_type_count": 221, "deployment": {"target": "esp32", "runtime": "esp-tflite-micro", "runtime_version": "1.3.3", "require_int8": true, "memory_limit_bytes": 327680}, "quantization": {"tflite_optimization": "DEFAULT", "representative_dataset": "val", "calibration_samples": 512, "symmetric_int8": true, "per_channel": true, "keep_float_fallback": false}, "thresholding": {"strategy": "recalibrate_on_quantized", "maximize_metric": "recall", "grid_points": 101}, "eedu": {"version": "1.0", "layout": "default"}}}, "f06_quant_v607": {"phase": "f06_quant", "variant": "v607", "parent": "v507", "parameters": {"parent_variant": "v507", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "FC_Active_Power_any-to-80_100", "event_type_count": 221, "deployment": {"target": "esp32", "runtime": "esp-tflite-micro", "runtime_version": "1.3.3", "require_int8": true, "memory_limit_bytes": 327680}, "quantization": {"tflite_optimization": "DEFAULT", "representative_dataset": "val", "calibration_samples": 512, "symmetric_int8": true, "per_channel": true, "keep_float_fallback": false}, "thresholding": {"strategy": "recalibrate_on_quantized", "maximize_metric": "recall", "grid_points": 101}, "eedu": {"version": "1.0", "layout": "default"}}}, "f06_quant_v608": {"phase": "f06_quant", "variant": "v608", "parent": "v508", "parameters": {"parent_variant": "v508", "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "MG-LV-MSB_AC_Voltage_any-to-80_100", "event_type_count": 221, "deployment": {"target": "esp32", "runtime": "esp-tflite-micro", "runtime_version": "1.3.3", "require_int8": true, "memory_limit_bytes": 327680}, "quantization": {"tflite_optimization": "DEFAULT", "representative_dataset": "val", "calibration_samples": 512, "symmetric_int8": true, "per_channel": true, "keep_float_fallback": false}, "thresholding": {"strategy": "recalibrate_on_quantized", "maximize_metric": "recall", "grid_points": 101}, "eedu": {"version": "1.0", "layout": "default"}}}, "f07_modval_v700": {}, "f07_modval_v701": {"phase": "f07_modval", "variant": "v701", "parent": "v601", "parameters": {"parent_variant": "v601", "time_scale_factor": 0.01, "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "Battery_Active_Power_Set_Response_any-to-80_100", "decision_threshold": 0.5142372250556946, "event_type_count": 221, "MTI_MS": 100, "platform": "esp32"}}, "f07_modval_v702": {"phase": "f07_modval", "variant": "v702", "parent": "v602", "parameters": {"parent_variant": "v602", "time_scale_factor": 0.01, "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "PVPCS_Active_Power_any-to-80_100", "decision_threshold": 0.4004252254962921, "event_type_count": 221, "MTI_MS": 100, "platform": "esp32"}}, "f07_modval_v703": {"phase": "f07_modval", "variant": "v703", "parent": "v603", "parameters": {"parent_variant": "v603", "time_scale_factor": 0.01, "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "GE_Active_Power_any-to-80_100", "decision_threshold": 0.6031056642532349, "event_type_count": 221, "MTI_MS": 100, "platform": "esp32"}}, "f07_modval_v704": {"phase": "f07_modval", "variant": "v704", "parent": "v604", "parameters": {"parent_variant": "v604", "time_scale_factor": 0.01, "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "GE_Body_Active_Power_any-to-80_100", "decision_threshold": 0.6028276681900024, "event_type_count": 221, "MTI_MS": 100, "platform": "esp32"}}, "f07_modval_v705": {"phase": "f07_modval", "variant": "v705", "parent": "v605", "parameters": {"parent_variant": "v605", "time_scale_factor": 0.01, "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "GE_Body_Active_Power_Set_Response_any-to-80_100", "event_type_count": 221, "MTI_MS": 100, "platform": "esp32"}}, "f07_modval_v706": {"phase": "f07_modval", "variant": "v706", "parent": "v606", "parameters": {"parent_variant": "v606", "time_scale_factor": 0.01, "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "FC_Active_Power_FC_END_Set_any-to-80_100", "decision_threshold": 0.7459286451339722, "event_type_count": 221, "MTI_MS": 100, "platform": "esp32"}}, "f07_modval_v707": {"phase": "f07_modval", "variant": "v707", "parent": "v607", "parameters": {"parent_variant": "v607", "time_scale_factor": 0.01, "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "FC_Active_Power_any-to-80_100", "decision_threshold": 0.554223358631134, "event_type_count": 221, "MTI_MS": 100, "platform": "esp32"}}, "f07_modval_v708": {"phase": "f07_modval", "variant": "v708", "parent": "v608", "parameters": {"parent_variant": "v608", "time_scale_factor": 0.01, "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "MG-LV-MSB_AC_Voltage_any-to-80_100", "event_type_count": 221, "MTI_MS": 100, "platform": "esp32"}}, "f07_modval_v710": {"phase": "f07_modval", "variant": "v710", "parent": "v600", "parameters": {"parent_variant": "v600", "time_scale_factor": 0.01, "Tu": 10, "OW": 6, "LT": 1, "PW": 1, "prediction_name": "Battery_Active_Power_any-to-80_100", "decision_threshold": 0.35558992624282837, "event_type_count": 221, "MTI_MS": 100, "platform": "esp32"}}, "f08_sysval_v800": {"phase": "f08_sysval", "variant": "v800", "parent": null, "parameters": {"parents": ["v700", "v701", "v702", "v703", "v704", "v705", "v706", "v707", "v708"], "selection_mode": "manual", "solver_time_limit_sec": 30, "time_scale_factor": 0.01, "MTI_MS": 100, "platform": "esp32"}}, "f08_sysval_v801": {"phase": "f08_sysval", "variant": "v801", "parent": null, "parameters": {"parents": ["v700", "v701", "v702", "v703", "v704", "v705", "v706", "v707", "v708"], "selection_mode": "auto_ilp", "objective": "max_global_recall", "solver_time_limit_sec": 30, "time_scale_factor": 0.01, "MTI_MS": 100, "platform": "esp32"}}, "f08_sysval_v802": {"phase": "f08_sysval", "variant": "v802", "parent": null, "parameters": {"parents": ["v700", "v701", "v702", "v703", "v704", "v705", "v706", "v707", "v708"], "selection_mode": "auto_ilp", "objective": "max_tp", "solver_time_limit_sec": 30, "time_scale_factor": 0.01, "MTI_MS": 100, "platform": "esp32"}}, "f08_sysval_v803": {"phase": "f08_sysval", "variant": "v803", "parent": null, "parameters": {"parents": ["v700", "v701", "v702", "v703", "v704", "v705", "v706", "v707", "v708"], "selection_mode": "auto_ilp", "objective": "max_tp", "solver_time_limit_sec": 30, "time_scale_factor": 0.01, "MTI_MS": 100, "platform": "esp32", "min_precision": 0.01, "min_recall": 0.05}}};

            function showConfig(nodeId) {
                document.getElementById('config-panel').classList.add('open');
                document.getElementById('config-title').innerText = "Variante: " + nodeId;
                document.getElementById('config-content').innerText = JSON.stringify(variantConfigs[nodeId], null, 2);
            }

            function closeConfig() {
                document.getElementById('config-panel').classList.remove('open');
            }

            // Función auxiliar para encontrar todos los ancestros (padres, abuelos, etc.)
            function findAllAncestors(nodeId, visitedNodes) {
                if (!visitedNodes) visitedNodes = new Set();
                if (visitedNodes.has(nodeId)) return [];
                visitedNodes.add(nodeId);
                
                let ancestors = [];
                lines.forEach(function(l) {
                    if (l.target === nodeId && !visitedNodes.has(l.source)) {
                        ancestors.push(l.source);
                        ancestors = ancestors.concat(findAllAncestors(l.source, visitedNodes));
                    }
                });
                return ancestors;
            }

            // Función auxiliar para encontrar todos los descendientes (hijos, nietos, etc.)
            function findAllDescendants(nodeId, visitedNodes) {
                if (!visitedNodes) visitedNodes = new Set();
                if (visitedNodes.has(nodeId)) return [];
                visitedNodes.add(nodeId);
                
                let descendants = [];
                lines.forEach(function(l) {
                    if (l.source === nodeId && !visitedNodes.has(l.target)) {
                        descendants.push(l.target);
                        descendants = descendants.concat(findAllDescendants(l.target, visitedNodes));
                    }
                });
                return descendants;
            }

            // Función para resaltar líneas conectadas al nodo y su genealogía completa
            function highlightLines(nodeId) {
                // Encontrar todos los ancestros y descendientes
                let ancestors = findAllAncestors(nodeId);
                let descendants = findAllDescendants(nodeId);
                let connectedNodes = new Set([nodeId, ...ancestors, ...descendants]);
                
                lines.forEach(function(l) {
                    // Resaltar si la línea conecta nodos en la genealogía
                    if (connectedNodes.has(l.source) && connectedNodes.has(l.target)) {
                        l.obj.color = '#ff5722'; // Naranja para resaltar
                        l.obj.size = 4;          // Más gruesa
                    } else {
                        l.obj.color = 'rgba(173, 181, 189, 0.1)'; // Transparente para ocultar
                    }
                });
            }

            // Función para volver al estado original
            function resetLines() {
                lines.forEach(function(l) {
                    l.obj.color = '#adb5bd';
                    l.obj.size = 2;
                });
            }

            window.addEventListener('load', function() {
                // Le damos 150ms al navegador para que dibuje el layout completo antes de trazar las líneas
                setTimeout(function() {
                    
                            var startNode = document.getElementById('f01_explore_v100');
                            var endNode = document.getElementById('f02_events_v200');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f01_explore_v100',
                                    target: 'f02_events_v200'
                                });
                            }
                        

                            var startNode = document.getElementById('f01_explore_v100');
                            var endNode = document.getElementById('f02_events_v201');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f01_explore_v100',
                                    target: 'f02_events_v201'
                                });
                            }
                        

                            var startNode = document.getElementById('f02_events_v200');
                            var endNode = document.getElementById('f03_windows_v300');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f02_events_v200',
                                    target: 'f03_windows_v300'
                                });
                            }
                        

                            var startNode = document.getElementById('f02_events_v200');
                            var endNode = document.getElementById('f03_windows_v301');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f02_events_v200',
                                    target: 'f03_windows_v301'
                                });
                            }
                        

                            var startNode = document.getElementById('f02_events_v201');
                            var endNode = document.getElementById('f03_windows_v302');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f02_events_v201',
                                    target: 'f03_windows_v302'
                                });
                            }
                        

                            var startNode = document.getElementById('f03_windows_v300');
                            var endNode = document.getElementById('f04_targets_v400');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f03_windows_v300',
                                    target: 'f04_targets_v400'
                                });
                            }
                        

                            var startNode = document.getElementById('f03_windows_v300');
                            var endNode = document.getElementById('f04_targets_v401');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f03_windows_v300',
                                    target: 'f04_targets_v401'
                                });
                            }
                        

                            var startNode = document.getElementById('f03_windows_v300');
                            var endNode = document.getElementById('f04_targets_v402');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f03_windows_v300',
                                    target: 'f04_targets_v402'
                                });
                            }
                        

                            var startNode = document.getElementById('f03_windows_v300');
                            var endNode = document.getElementById('f04_targets_v403');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f03_windows_v300',
                                    target: 'f04_targets_v403'
                                });
                            }
                        

                            var startNode = document.getElementById('f03_windows_v300');
                            var endNode = document.getElementById('f04_targets_v404');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f03_windows_v300',
                                    target: 'f04_targets_v404'
                                });
                            }
                        

                            var startNode = document.getElementById('f03_windows_v300');
                            var endNode = document.getElementById('f04_targets_v405');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f03_windows_v300',
                                    target: 'f04_targets_v405'
                                });
                            }
                        

                            var startNode = document.getElementById('f03_windows_v300');
                            var endNode = document.getElementById('f04_targets_v406');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f03_windows_v300',
                                    target: 'f04_targets_v406'
                                });
                            }
                        

                            var startNode = document.getElementById('f03_windows_v300');
                            var endNode = document.getElementById('f04_targets_v407');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f03_windows_v300',
                                    target: 'f04_targets_v407'
                                });
                            }
                        

                            var startNode = document.getElementById('f03_windows_v300');
                            var endNode = document.getElementById('f04_targets_v408');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f03_windows_v300',
                                    target: 'f04_targets_v408'
                                });
                            }
                        

                            var startNode = document.getElementById('f04_targets_v400');
                            var endNode = document.getElementById('f05_modeling_v500');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f04_targets_v400',
                                    target: 'f05_modeling_v500'
                                });
                            }
                        

                            var startNode = document.getElementById('f04_targets_v401');
                            var endNode = document.getElementById('f05_modeling_v501');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f04_targets_v401',
                                    target: 'f05_modeling_v501'
                                });
                            }
                        

                            var startNode = document.getElementById('f04_targets_v402');
                            var endNode = document.getElementById('f05_modeling_v502');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f04_targets_v402',
                                    target: 'f05_modeling_v502'
                                });
                            }
                        

                            var startNode = document.getElementById('f04_targets_v403');
                            var endNode = document.getElementById('f05_modeling_v503');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f04_targets_v403',
                                    target: 'f05_modeling_v503'
                                });
                            }
                        

                            var startNode = document.getElementById('f04_targets_v404');
                            var endNode = document.getElementById('f05_modeling_v504');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f04_targets_v404',
                                    target: 'f05_modeling_v504'
                                });
                            }
                        

                            var startNode = document.getElementById('f04_targets_v405');
                            var endNode = document.getElementById('f05_modeling_v505');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f04_targets_v405',
                                    target: 'f05_modeling_v505'
                                });
                            }
                        

                            var startNode = document.getElementById('f04_targets_v406');
                            var endNode = document.getElementById('f05_modeling_v506');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f04_targets_v406',
                                    target: 'f05_modeling_v506'
                                });
                            }
                        

                            var startNode = document.getElementById('f04_targets_v407');
                            var endNode = document.getElementById('f05_modeling_v507');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f04_targets_v407',
                                    target: 'f05_modeling_v507'
                                });
                            }
                        

                            var startNode = document.getElementById('f04_targets_v408');
                            var endNode = document.getElementById('f05_modeling_v508');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f04_targets_v408',
                                    target: 'f05_modeling_v508'
                                });
                            }
                        

                            var startNode = document.getElementById('f05_modeling_v500');
                            var endNode = document.getElementById('f06_quant_v600');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f05_modeling_v500',
                                    target: 'f06_quant_v600'
                                });
                            }
                        

                            var startNode = document.getElementById('f05_modeling_v501');
                            var endNode = document.getElementById('f06_quant_v601');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f05_modeling_v501',
                                    target: 'f06_quant_v601'
                                });
                            }
                        

                            var startNode = document.getElementById('f05_modeling_v502');
                            var endNode = document.getElementById('f06_quant_v602');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f05_modeling_v502',
                                    target: 'f06_quant_v602'
                                });
                            }
                        

                            var startNode = document.getElementById('f05_modeling_v503');
                            var endNode = document.getElementById('f06_quant_v603');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f05_modeling_v503',
                                    target: 'f06_quant_v603'
                                });
                            }
                        

                            var startNode = document.getElementById('f05_modeling_v504');
                            var endNode = document.getElementById('f06_quant_v604');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f05_modeling_v504',
                                    target: 'f06_quant_v604'
                                });
                            }
                        

                            var startNode = document.getElementById('f05_modeling_v505');
                            var endNode = document.getElementById('f06_quant_v605');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f05_modeling_v505',
                                    target: 'f06_quant_v605'
                                });
                            }
                        

                            var startNode = document.getElementById('f05_modeling_v506');
                            var endNode = document.getElementById('f06_quant_v606');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f05_modeling_v506',
                                    target: 'f06_quant_v606'
                                });
                            }
                        

                            var startNode = document.getElementById('f05_modeling_v507');
                            var endNode = document.getElementById('f06_quant_v607');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f05_modeling_v507',
                                    target: 'f06_quant_v607'
                                });
                            }
                        

                            var startNode = document.getElementById('f05_modeling_v508');
                            var endNode = document.getElementById('f06_quant_v608');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f05_modeling_v508',
                                    target: 'f06_quant_v608'
                                });
                            }
                        

                            var startNode = document.getElementById('f06_quant_v601');
                            var endNode = document.getElementById('f07_modval_v701');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f06_quant_v601',
                                    target: 'f07_modval_v701'
                                });
                            }
                        

                            var startNode = document.getElementById('f06_quant_v602');
                            var endNode = document.getElementById('f07_modval_v702');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f06_quant_v602',
                                    target: 'f07_modval_v702'
                                });
                            }
                        

                            var startNode = document.getElementById('f06_quant_v603');
                            var endNode = document.getElementById('f07_modval_v703');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f06_quant_v603',
                                    target: 'f07_modval_v703'
                                });
                            }
                        

                            var startNode = document.getElementById('f06_quant_v604');
                            var endNode = document.getElementById('f07_modval_v704');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f06_quant_v604',
                                    target: 'f07_modval_v704'
                                });
                            }
                        

                            var startNode = document.getElementById('f06_quant_v605');
                            var endNode = document.getElementById('f07_modval_v705');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f06_quant_v605',
                                    target: 'f07_modval_v705'
                                });
                            }
                        

                            var startNode = document.getElementById('f06_quant_v606');
                            var endNode = document.getElementById('f07_modval_v706');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f06_quant_v606',
                                    target: 'f07_modval_v706'
                                });
                            }
                        

                            var startNode = document.getElementById('f06_quant_v607');
                            var endNode = document.getElementById('f07_modval_v707');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f06_quant_v607',
                                    target: 'f07_modval_v707'
                                });
                            }
                        

                            var startNode = document.getElementById('f06_quant_v608');
                            var endNode = document.getElementById('f07_modval_v708');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f06_quant_v608',
                                    target: 'f07_modval_v708'
                                });
                            }
                        

                            var startNode = document.getElementById('f06_quant_v600');
                            var endNode = document.getElementById('f07_modval_v710');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f06_quant_v600',
                                    target: 'f07_modval_v710'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v700');
                            var endNode = document.getElementById('f08_sysval_v800');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v700',
                                    target: 'f08_sysval_v800'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v701');
                            var endNode = document.getElementById('f08_sysval_v800');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v701',
                                    target: 'f08_sysval_v800'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v702');
                            var endNode = document.getElementById('f08_sysval_v800');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v702',
                                    target: 'f08_sysval_v800'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v703');
                            var endNode = document.getElementById('f08_sysval_v800');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v703',
                                    target: 'f08_sysval_v800'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v704');
                            var endNode = document.getElementById('f08_sysval_v800');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v704',
                                    target: 'f08_sysval_v800'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v705');
                            var endNode = document.getElementById('f08_sysval_v800');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v705',
                                    target: 'f08_sysval_v800'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v706');
                            var endNode = document.getElementById('f08_sysval_v800');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v706',
                                    target: 'f08_sysval_v800'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v707');
                            var endNode = document.getElementById('f08_sysval_v800');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v707',
                                    target: 'f08_sysval_v800'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v708');
                            var endNode = document.getElementById('f08_sysval_v800');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v708',
                                    target: 'f08_sysval_v800'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v700');
                            var endNode = document.getElementById('f08_sysval_v801');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v700',
                                    target: 'f08_sysval_v801'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v701');
                            var endNode = document.getElementById('f08_sysval_v801');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v701',
                                    target: 'f08_sysval_v801'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v702');
                            var endNode = document.getElementById('f08_sysval_v801');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v702',
                                    target: 'f08_sysval_v801'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v703');
                            var endNode = document.getElementById('f08_sysval_v801');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v703',
                                    target: 'f08_sysval_v801'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v704');
                            var endNode = document.getElementById('f08_sysval_v801');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v704',
                                    target: 'f08_sysval_v801'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v705');
                            var endNode = document.getElementById('f08_sysval_v801');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v705',
                                    target: 'f08_sysval_v801'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v706');
                            var endNode = document.getElementById('f08_sysval_v801');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v706',
                                    target: 'f08_sysval_v801'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v707');
                            var endNode = document.getElementById('f08_sysval_v801');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v707',
                                    target: 'f08_sysval_v801'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v708');
                            var endNode = document.getElementById('f08_sysval_v801');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v708',
                                    target: 'f08_sysval_v801'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v700');
                            var endNode = document.getElementById('f08_sysval_v802');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v700',
                                    target: 'f08_sysval_v802'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v701');
                            var endNode = document.getElementById('f08_sysval_v802');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v701',
                                    target: 'f08_sysval_v802'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v702');
                            var endNode = document.getElementById('f08_sysval_v802');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v702',
                                    target: 'f08_sysval_v802'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v703');
                            var endNode = document.getElementById('f08_sysval_v802');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v703',
                                    target: 'f08_sysval_v802'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v704');
                            var endNode = document.getElementById('f08_sysval_v802');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v704',
                                    target: 'f08_sysval_v802'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v705');
                            var endNode = document.getElementById('f08_sysval_v802');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v705',
                                    target: 'f08_sysval_v802'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v706');
                            var endNode = document.getElementById('f08_sysval_v802');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v706',
                                    target: 'f08_sysval_v802'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v707');
                            var endNode = document.getElementById('f08_sysval_v802');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v707',
                                    target: 'f08_sysval_v802'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v708');
                            var endNode = document.getElementById('f08_sysval_v802');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v708',
                                    target: 'f08_sysval_v802'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v700');
                            var endNode = document.getElementById('f08_sysval_v803');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v700',
                                    target: 'f08_sysval_v803'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v701');
                            var endNode = document.getElementById('f08_sysval_v803');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v701',
                                    target: 'f08_sysval_v803'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v702');
                            var endNode = document.getElementById('f08_sysval_v803');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v702',
                                    target: 'f08_sysval_v803'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v703');
                            var endNode = document.getElementById('f08_sysval_v803');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v703',
                                    target: 'f08_sysval_v803'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v704');
                            var endNode = document.getElementById('f08_sysval_v803');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v704',
                                    target: 'f08_sysval_v803'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v705');
                            var endNode = document.getElementById('f08_sysval_v803');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v705',
                                    target: 'f08_sysval_v803'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v706');
                            var endNode = document.getElementById('f08_sysval_v803');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v706',
                                    target: 'f08_sysval_v803'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v707');
                            var endNode = document.getElementById('f08_sysval_v803');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v707',
                                    target: 'f08_sysval_v803'
                                });
                            }
                        

                            var startNode = document.getElementById('f07_modval_v708');
                            var endNode = document.getElementById('f08_sysval_v803');
                            if (startNode && endNode) {
                                var line = new LeaderLine(startNode, endNode, { 
                                    color: '#adb5bd', 
                                    size: 2, 
                                    path: 'fluid', 
                                    startSocket: 'right', 
                                    endSocket: 'left'
                                });
                                lines.push({
                                    obj: line,
                                    source: 'f07_modval_v708',
                                    target: 'f08_sysval_v803'
                                });
                            }
                        
                }, 150);
            });

            // Listener de scroll ajustado usando requestAnimationFrame para mayor rendimiento
            document.getElementById('pipeline-container').addEventListener('scroll', function() {
                window.requestAnimationFrame(function() {
                    lines.forEach(function(l) {
                        l.obj.position(); // Actualizado para llamar a .obj
                    });
                });
            });

            window.addEventListener('resize', function() {
                lines.forEach(function(l) {
                    l.obj.position(); // Actualizado para llamar a .obj
                });
            });
        </script>
    </body>
    </html>
    
```
### Consulta
Esta vista tendrá todas las fases para mandar al trigger de github actios, con campos para meter numero de la variantes y sus posibles parametros.
Ademeas de teenr una columna desed la cual ver todas las consutlas que estan ejecutandose o pendiente de ejecución, ya que si creamos mas de 20 jobs al msimo tiempo no son permitidas por github actions, por lo que hara falta que se encolen. Mas otra columna desde la cual podemos ver todas las que ya se han ejectuado y otra donde se verán las que han fallado.

#### Interfaz
Interfaz beta, no tener en cuenta del todo ya que es un planteamiento

```bash 
|   (1)   |         | 
|  -----  |         |
|   (2)   |         |
|  -----  |         |
|   (3)   |   (0)   |
|  -----  |         |
|   (4)   |         |
|  -----  |         |
|   (etc) |         |
```
Columna de la izquierda:    md-9
Columna de la derecha:      md-3

(1) -> Control de fase 1
(2) -> Control de fase 2
(3) -> Control de fase 3
(4) -> Control de fase 4
(etc) -> Asi continuaremos hasta completar todas las fases definiadas en el app.control_file

(0)   -> Columan para ver el buffer

#### Interfaz de las fases

```bash 
| __faseX______________________________________| 
| varain: <input> <resetos de params>| submit  |
|______________________________________________| 
```
Quiero que las fases este en un recuadro para que se diferencien bien unas de otras.


### Jobs Logs
Desde aqui podemos ver todos los logs en tarjetas de todas los jobs variantes que estan en ejecuión como se ven en github actions.
### Control de runners
Hay 2 fases finales que seran runner autoalojadaos por lo que queremos ver los logs de esta pagina desde esta pagina. Ya que estos son compoentes complejos que orednan ejecución en comooentes externos como es una esp32 para hacer pruebas.
En esta vista podemos ver los logs de lo runners