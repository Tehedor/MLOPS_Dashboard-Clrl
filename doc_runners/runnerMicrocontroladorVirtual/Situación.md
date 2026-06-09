# Situación 

Quiero que me hagas un Makefile donde me despliegues toda la configuración para desplegar una esp32 virtualziada para que pueda correrse igual que si fuese una real. Para ello, quiero que mires el documento que me ha dado gemini de como hacerlo `doc_runners/runnerMicrocontroladorVirtual/Doc.md` y lo despliegues.

El Makefile debe tener para configurarlo para arch y para debian, ya que las pruebas las hago en este ordeodor con arch y lo desplegaré en debian.

Por un lado quiero que el Makefile tenga un comando para verificar que esta todo instalador.

Quiero otro comando para parar todo y otro para instalarlo.


## Scirpts que hacen la conexión
doc_runners/runnerMicrocontroladorVirtual:
    f071_preparebuild.py  
    f072_flashrun.py  
    f073_post.py

Quiero que me hagas una nueva versión de estos scripts para verificar que funciona todas estas subfases con la esp32 virutalizada