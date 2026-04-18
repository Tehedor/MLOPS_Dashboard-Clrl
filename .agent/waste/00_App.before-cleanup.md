# Dashboard de solicitudes de pipeline
Aplicación global desde la cual se puede gestionar, ver y administrar toda la gestión de un proeycto de MLOPS. Esta aplicación sera containerizada en Docker siendo una aplciación cliente-servidor para que se pueda utilizar tanto self-hosted en nuestro oredenador local como en un servidor externo.

Esta aplciación tendrá diferentes tabs donde cada vista tendrá una interfaz diferente.
(De momento solo se desarrollará la vista 1 de servicio de consulta, dejando preparado el sistema de archivos para cuando añadamos las demás)

## Servicios
1. Vista 1 servicios de consutla
2. Vista 2 servicio jerarquico de variantes/fase
3. Vista 3 servicio de logs de los runners
4. Vista 4 serivcio control de runners endebidos 

## Archivos de configuración
1. toda la configracioens dinamicas que debemos meter de maenra manual serán gestionadas a través del `confg.yml`, por lo tanto si ves que hace falta poner mas sientete libre de añadir nuevos campos
2. Las variables de entorno estarán en el file .env. Añade los campos que deba rellenar para que funcione la aplcaición de manera adecuada.
3. Direcotio de trabajo app/*
4. Todo el css quiero que lo dejees definido de manera clara para poder luego hacer cambios en coperativo
