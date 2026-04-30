# Vista de Anáisis

Estado: Diseñado - Pendiente implementar

## Obejtivo
Vista donde estan todos los scirpts de analisis por fase a la que se puede aplicar, desde la cual la podemos ejecutar y acceder a los informes creados.

## Diseño de scrpt
Scripts estan en config.yaml -> analisis_files_path:

Estos files tendrán en la cabecera metadatos como:
nobre: > Nombre con el quue eremos que salga
fases: > fase que analiza
files: > output que genera / directorio de donde
descripción: > Descripcón corta con lo que hace
... todo lo que se te ocurra.


## Interfaz
```bash 
┌──────────────────────────────────────────────────────────────────────┐
│ MLOps | Dashboard | Ejecuciones | GH Actions | Runners | Servicios… │
├──────────────────────────────────────────────────────────────────────┤
│  Analis filtro/fase  │ faseX disponible        │   fasseY disponible....
│                      │ 
│                      │ v1_XXXX    Run enacle x
│                      │ v1_XXXX    Stop
│  Service2            │  ....
│                      │ 
│                      │  
│                      │ 
│ 
│  
│  
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```